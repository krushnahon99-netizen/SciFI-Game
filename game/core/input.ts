import type { Emitter, GameEvents } from './events'

export type Action =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'run'
  | 'jump'
  | 'descend'
  | 'pulse'
  | 'interact'
  | 'pause'
  | 'journal'
  | 'mute'
  | 'perf'

export type LookMode = 'pointer-lock' | 'drag'

/** Bound by physical key position (`KeyboardEvent.code`), so WASD also works on AZERTY/QWERTZ layouts. */
const KEY_BINDINGS: Readonly<Record<string, Action>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  Space: 'jump',
  KeyC: 'descend',
  KeyQ: 'pulse',
  KeyE: 'interact',
  Escape: 'pause',
  KeyP: 'pause',
  KeyJ: 'journal',
  KeyM: 'mute',
  F3: 'perf',
}

/** Single mouse events larger than this are browser glitches (seen right after pointer lock), not real motion. */
const MAX_LOOK_EVENT_DELTA = 350
/** A press/release that travels less than this counts as a click rather than a camera drag. */
const CLICK_SLOP_PX = 6

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function isActivatable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'A')
}

interface DragState {
  id: number
  button: number
  x: number
  y: number
  travelled: number
}

/**
 * Keyboard, mouse (pointer lock with drag-to-look fallback) and the virtual API used by touch controls.
 * State is per frame: read it during update, then `endFrame()` clears one-frame presses and look deltas.
 */
export class Input {
  /** Look movement accumulated this frame, in pixels. */
  readonly lookDelta = { x: 0, y: 0 }
  /** Wheel steps this frame (+1 = away from the player). */
  wheel = 0
  pointerLocked = false
  lookMode: LookMode
  /** Clicking the game view captures the mouse (or pulses in drag mode) only while this is true. */
  lockOnClick = false

  private readonly holders = new Map<Action, Set<string>>()
  private readonly pressed = new Set<Action>()
  private readonly virtualMove = { x: 0, y: 0 }
  private readonly moveAxis = { x: 0, y: 0 }
  private lockEverSucceeded = false
  private drag: DragState | null = null

  constructor(
    private readonly element: HTMLElement,
    private readonly events: Emitter<GameEvents>,
  ) {
    this.lookMode = typeof element.requestPointerLock === 'function' ? 'pointer-lock' : 'drag'
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.releaseAll)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('pointerlockerror', this.onLockError)
    document.addEventListener('mousemove', this.onMouseMove)
    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    element.addEventListener('pointerup', this.onPointerUp)
    element.addEventListener('pointercancel', this.onPointerUp)
    element.addEventListener('wheel', this.onWheel, { passive: false })
    element.addEventListener('contextmenu', this.onContextMenu)
  }

  isDown(action: Action): boolean {
    return (this.holders.get(action)?.size ?? 0) > 0
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action)
  }

  /** Keyboard + virtual joystick; x = strafe right, y = forward. Length is at most 1. */
  getMoveAxis(): Readonly<{ x: number; y: number }> {
    let x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0) + this.virtualMove.x
    let y = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0) + this.virtualMove.y
    const length = Math.hypot(x, y)
    if (length > 1) {
      x /= length
      y /= length
    }
    this.moveAxis.x = x
    this.moveAxis.y = y
    return this.moveAxis
  }

  // --- Virtual input (touch controls) -------------------------------------------------------

  setVirtualMove(x: number, y: number) {
    this.virtualMove.x = x
    this.virtualMove.y = y
  }

  addLook(dx: number, dy: number) {
    this.lookDelta.x += dx
    this.lookDelta.y += dy
  }

  /** Hold an action from a named source; the action stays down until every source releases it. */
  press(action: Action, source: string) {
    let set = this.holders.get(action)
    if (!set) {
      set = new Set()
      this.holders.set(action, set)
    }
    if (set.size === 0) this.pressed.add(action)
    set.add(source)
  }

  release(action: Action, source: string) {
    this.holders.get(action)?.delete(source)
  }

  /** One-frame press without holding (clicks, taps). */
  tap(action: Action) {
    this.pressed.add(action)
  }

  // --- Pointer lock -------------------------------------------------------------------------

  requestPointerLock() {
    if (this.lookMode !== 'pointer-lock' || this.pointerLocked) return
    try {
      const result: unknown = this.element.requestPointerLock()
      if (result instanceof Promise) result.catch(this.onLockError)
    } catch {
      this.onLockError()
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.element) document.exitPointerLock()
  }

  /** Call once at the very end of every frame. */
  endFrame() {
    this.pressed.clear()
    this.lookDelta.x = 0
    this.lookDelta.y = 0
    this.wheel = 0
  }

  dispose() {
    this.exitPointerLock()
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.releaseAll)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('pointerlockerror', this.onLockError)
    document.removeEventListener('mousemove', this.onMouseMove)
    this.element.removeEventListener('pointerdown', this.onPointerDown)
    this.element.removeEventListener('pointermove', this.onPointerMove)
    this.element.removeEventListener('pointerup', this.onPointerUp)
    this.element.removeEventListener('pointercancel', this.onPointerUp)
    this.element.removeEventListener('wheel', this.onWheel)
    this.element.removeEventListener('contextmenu', this.onContextMenu)
  }

  // --- DOM handlers ---------------------------------------------------------------------------

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return
    // Let Space/Enter activate a focused menu button instead of jumping.
    if (isActivatable(event.target) && (event.code === 'Space' || event.code === 'Enter')) return
    const action = KEY_BINDINGS[event.code]
    if (!action) return
    event.preventDefault()
    if (!event.repeat) this.press(action, event.code)
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    const action = KEY_BINDINGS[event.code]
    if (action) this.release(action, event.code)
  }

  private readonly releaseAll = () => {
    this.holders.forEach((set) => set.clear())
    this.virtualMove.x = 0
    this.virtualMove.y = 0
    this.drag = null
  }

  private readonly onVisibilityChange = () => {
    if (document.hidden) this.releaseAll()
  }

  private readonly onLockChange = () => {
    const locked = document.pointerLockElement === this.element
    if (locked) this.lockEverSucceeded = true
    if (locked === this.pointerLocked) return
    this.pointerLocked = locked
    if (!locked) this.release('pulse', 'mouse')
    this.events.emit('pointerLock', { locked })
  }

  private readonly onLockError = () => {
    // Sandboxed iframes refuse pointer lock entirely, so fall back to drag-to-look for the session.
    // A failure after a lock already worked is only Chrome's short re-lock cooldown after Esc.
    if (this.lockEverSucceeded || this.lookMode === 'drag') return
    this.lookMode = 'drag'
    this.events.emit('lookMode', { mode: 'drag' })
  }

  private readonly onMouseMove = (event: MouseEvent) => {
    if (!this.pointerLocked) return
    if (Math.abs(event.movementX) > MAX_LOOK_EVENT_DELTA || Math.abs(event.movementY) > MAX_LOOK_EVENT_DELTA) return
    this.addLook(event.movementX, event.movementY)
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return // handled by the on-screen touch controls
    if (this.pointerLocked) {
      if (event.button === 0) this.press('pulse', 'mouse')
      return
    }
    if (event.button !== 0 && event.button !== 2) return
    this.drag = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, travelled: 0 }
    this.element.setPointerCapture?.(event.pointerId)
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    const drag = this.drag
    if (!drag || event.pointerId !== drag.id || this.pointerLocked) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY
    drag.travelled += Math.abs(dx) + Math.abs(dy)
    this.addLook(dx, dy)
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.pointerLocked) {
      if (event.button === 0) this.release('pulse', 'mouse')
      return
    }
    const drag = this.drag
    if (!drag || event.pointerId !== drag.id) return
    this.drag = null
    if (event.type === 'pointercancel' || drag.button !== 0 || drag.travelled > CLICK_SLOP_PX || !this.lockOnClick) return
    if (this.lookMode === 'pointer-lock') this.requestPointerLock()
    else this.tap('pulse')
  }

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.wheel += Math.sign(event.deltaY)
  }

  private readonly onContextMenu = (event: Event) => {
    event.preventDefault()
  }
}
