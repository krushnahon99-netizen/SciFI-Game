/**
 * Unified input: keyboard + mouse (pointer lock with drag-look fallback), gamepad and touch
 * (touch values are written into `touchInput` by the on-screen controls).
 */
import { touchInput } from '../ui/store'

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
}

export class Input {
  moveX = 0
  moveY = 0
  run = false
  private lookX = 0
  private lookY = 0
  private zoom = 0
  private keys = new Set<string>()
  private edges = new Set<'jump' | 'pulse' | 'interact' | 'pause'>()
  private held = { jump: false, pulse: false, interact: false }
  private dragging = false
  private lastPad: boolean[] = []
  pointerLocked = false
  lookMode: 'lock' | 'drag' = 'lock'
  usingGamepad = false
  enabled = true
  onPointerLockChange?: (locked: boolean) => void
  onPointerLockError?: () => void

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    canvas.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('wheel', this.onWheel, { passive: true })
    canvas.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onLockChange)
    document.addEventListener('pointerlockerror', this.onLockError)
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('contextmenu', this.onContextMenu)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    document.removeEventListener('pointerlockerror', this.onLockError)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  requestPointerLock() {
    if (this.lookMode !== 'lock' || document.pointerLockElement === this.canvas) return
    try {
      const result = this.canvas.requestPointerLock() as unknown
      if (result instanceof Promise) result.catch(() => this.onLockError())
    } catch {
      this.onLockError()
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }

  pressed(action: 'jump' | 'pulse' | 'interact' | 'pause') {
    return this.edges.has(action)
  }

  isHeld(action: 'jump' | 'pulse' | 'interact') {
    return this.held[action]
  }

  /** Touch / UI buttons. */
  setAction(action: 'jump' | 'pulse' | 'interact' | 'run', down: boolean) {
    if (action === 'run') {
      this.run = down
      return
    }
    if (down && !this.held[action]) this.edges.add(action)
    this.held[action] = down
  }

  /** Returns accumulated look delta in pixels-equivalent and resets it. */
  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookX + touchInput.lookDX, this.lookY + touchInput.lookDY]
    this.lookX = 0
    this.lookY = 0
    touchInput.lookDX = 0
    touchInput.lookDY = 0
    return r
  }

  consumeZoom() {
    const z = this.zoom
    this.zoom = 0
    return z
  }

  /** Poll gamepads and compose the move vector. Call once per frame before reading. */
  poll(dt: number) {
    let mx = 0
    let my = 0
    for (const k of this.keys) {
      const m = MOVE_KEYS[k]
      if (m) {
        mx += m[0]
        my += m[1]
      }
    }
    const keyRun = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')
    let padRun = false
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    for (const pad of pads) {
      if (!pad || !pad.connected) continue
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82)
      const lx = dz(pad.axes[0] ?? 0)
      const ly = dz(pad.axes[1] ?? 0)
      const rx = dz(pad.axes[2] ?? 0)
      const ry = dz(pad.axes[3] ?? 0)
      if (lx || ly || rx || ry || pad.buttons.some((b) => b.pressed)) this.usingGamepad = true
      mx += lx
      my -= ly
      this.lookX += rx * 900 * dt
      this.lookY += ry * 650 * dt
      const btn = (i: number) => !!pad.buttons[i]?.pressed
      const edge = (i: number, action: 'jump' | 'pulse' | 'interact' | 'pause') => {
        if (btn(i) && !this.lastPad[i]) this.edges.add(action)
      }
      edge(0, 'jump')
      edge(2, 'interact')
      edge(1, 'interact')
      edge(5, 'pulse')
      edge(7, 'pulse')
      edge(9, 'pause')
      this.held.jump ||= btn(0)
      padRun = btn(10) || btn(6) || Math.hypot(lx, ly) > 0.95
      for (let i = 0; i < pad.buttons.length; i++) this.lastPad[i] = btn(i)
      break
    }
    mx += touchInput.moveX
    my += touchInput.moveY
    const len = Math.hypot(mx, my)
    if (len > 1) {
      mx /= len
      my /= len
    }
    this.moveX = this.enabled ? mx : 0
    this.moveY = this.enabled ? my : 0
    this.run = keyRun || padRun || (this.run && touchInput.moveX !== 0)
  }

  endFrame() {
    this.edges.clear()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    this.usingGamepad = false
    if (e.code === 'Space') e.preventDefault()
    if (e.repeat) return
    this.keys.add(e.code)
    if (e.code === 'Space') this.setAction('jump', true)
    if (e.code === 'KeyQ' || e.code === 'KeyF') this.setAction('pulse', true)
    if (e.code === 'KeyE') this.setAction('interact', true)
    if (e.code === 'Escape' || e.code === 'KeyP') this.edges.add('pause')
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
    if (e.code === 'Space') this.setAction('jump', false)
    if (e.code === 'KeyQ' || e.code === 'KeyF') this.setAction('pulse', false)
    if (e.code === 'KeyE') this.setAction('interact', false)
  }

  private onBlur = () => {
    this.keys.clear()
    this.held = { jump: false, pulse: false, interact: false }
    this.dragging = false
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.enabled) return
    if (e.button === 2) {
      this.edges.add('pulse')
      return
    }
    if (this.lookMode === 'lock' && !this.pointerLocked) {
      this.requestPointerLock()
      return
    }
    if (this.lookMode === 'drag' && e.button === 0) this.dragging = true
  }

  private onMouseUp = () => {
    this.dragging = false
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled) return
    if (this.pointerLocked || this.dragging) {
      this.lookX += e.movementX
      this.lookY += e.movementY
    }
  }

  private onWheel = (e: WheelEvent) => {
    this.zoom += Math.sign(e.deltaY)
  }

  private onContextMenu = (e: Event) => e.preventDefault()

  private onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas
    this.onPointerLockChange?.(this.pointerLocked)
  }

  private onLockError = () => {
    this.lookMode = 'drag'
    this.pointerLocked = false
    this.onPointerLockError?.()
  }
}
