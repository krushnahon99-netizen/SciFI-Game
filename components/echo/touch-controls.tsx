'use client'

import { ChevronsUp, Hand, Menu } from 'lucide-react'
import { useEffect, useRef, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import type { Input } from '@/game/core/input'
import { TOUCH } from '@/game/gameplay/content'
import { uiStore } from '@/game/ui/store'
import { cn } from '@/lib/utils'
import { useGame } from './game-context'
import { PulseRing } from './pulse-indicator'
import { useTouchMode } from './use-touch-mode'
import { useUI } from './use-ui'

/** Input source name for every action held by the touch controls. */
const SOURCE = 'touch'
/** Knob travel (px) for full deflection. */
const STICK_RADIUS = 48
/** Stick deflection ignored around the centre (fraction of the radius). */
const DEAD_ZONE = 0.12
/** Deflection (after the dead zone) at which the explorer runs. */
const RUN_AT = 0.9
/** Finger travel is coarser than a mouse, so look a little faster per pixel. */
const LOOK_SCALE = 1.6
/** Wheel notches per pixel of pinch spread (fingers apart = closer). */
const PINCH_SCALE = 0.025

interface Track {
  id: number
  x: number
  y: number
}

/** Keeps a finger's events on the control it started on, even after it slides off. */
function capture(element: Element, pointerId: number) {
  try {
    element.setPointerCapture(pointerId)
  } catch {
    // The pointer already lifted (or the event was synthetic): the control still works without capture.
  }
}

/** On-screen controls for coarse pointers, only while playing: joystick (left), look pad (right), action buttons. */
export function TouchControls() {
  const game = useGame()
  const touch = useTouchMode()
  const phase = useUI((state) => state.phase)
  const cinematic = useUI((state) => state.cinematic)

  if (!game || !touch || phase !== 'playing' || cinematic) return null
  return <TouchLayer input={game.input} onMenu={() => game.pause()} />
}

function TouchLayer({ input, onMenu }: { input: Input; onMenu: () => void }) {
  const prompt = useUI((state) => state.interactPrompt)

  // Pausing (or any phase change) unmounts the layer: let go of everything a finger was still holding.
  useEffect(
    () => () => {
      input.setVirtualMove(0, 0)
      input.release('run', SOURCE)
      input.release('jump', SOURCE)
    },
    [input],
  )

  const pulse = () => {
    if (uiStore.getState().pulseCharge >= 1) navigator.vibrate?.(12)
    input.tap('pulse')
  }

  return (
    <div role="group" aria-label={TOUCH.controls} className="pointer-events-none absolute inset-0 z-20 touch-none">
      <Stick input={input} />
      <LookPad input={input} />

      <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] h-[9.75rem] w-[9rem]">
        {prompt && (
          <PadButton
            label={`${TOUCH.interact}: ${prompt}`}
            onPress={() => input.tap('interact')}
            className="absolute bottom-[6.25rem] right-[0.625rem] size-14 animate-[echo-rise_0.3s_ease-out_both] border-primary/60 text-primary motion-reduce:animate-none"
          >
            <Hand className="size-6" aria-hidden="true" />
          </PadButton>
        )}
        <PadButton
          label={TOUCH.jump}
          onPress={() => input.press('jump', SOURCE)}
          onRelease={() => input.release('jump', SOURCE)}
          className="absolute bottom-0 right-[5.5rem] size-14"
        >
          <ChevronsUp className="size-6" aria-hidden="true" />
        </PadButton>
        <PadButton label={TOUCH.pulse} onPress={pulse} className="absolute bottom-2 right-0 size-[4.75rem] border-0 bg-transparent">
          <PulseRing className="size-full" />
        </PadButton>
      </div>

      <button
        type="button"
        aria-label={TOUCH.menu}
        onClick={onMenu}
        className="pointer-events-auto absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] grid size-10 place-items-center rounded-full border border-foreground/25 bg-background/45 text-foreground/90 backdrop-blur-sm transition-colors active:border-primary/70 active:text-primary"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
    </div>
  )
}

/** Floating joystick: appears where the left thumb lands; full deflection runs. */
function Stick({ input }: { input: Input }) {
  const baseRef = useRef<HTMLDivElement>(null)
  const knobRef = useRef<HTMLDivElement>(null)
  const track = useRef<Track | null>(null)

  const steer = (clientX: number, clientY: number) => {
    const origin = track.current
    if (!origin) return
    let dx = clientX - origin.x
    let dy = clientY - origin.y
    const length = Math.hypot(dx, dy)
    if (length > STICK_RADIUS) {
      dx *= STICK_RADIUS / length
      dy *= STICK_RADIUS / length
    }
    if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`
    const reach = Math.min(length / STICK_RADIUS, 1)
    const amount = reach <= DEAD_ZONE ? 0 : (reach - DEAD_ZONE) / (1 - DEAD_ZONE)
    const scale = length > 0 ? amount / Math.min(length, STICK_RADIUS) : 0
    input.setVirtualMove(dx * scale, -dy * scale)
    if (amount >= RUN_AT) input.press('run', SOURCE)
    else input.release('run', SOURCE)
  }

  const start = (event: PointerEvent<HTMLDivElement>) => {
    const base = baseRef.current
    if (track.current || !base) return
    const rest = base.getBoundingClientRect()
    track.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
    base.style.transform = `translate(${event.clientX - (rest.left + rest.width / 2)}px, ${event.clientY - (rest.top + rest.height / 2)}px)`
    base.dataset.active = 'true'
    capture(event.currentTarget, event.pointerId)
  }

  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (track.current?.id !== event.pointerId) return
    track.current = null
    input.setVirtualMove(0, 0)
    input.release('run', SOURCE)
    if (baseRef.current) {
      baseRef.current.style.transform = ''
      delete baseRef.current.dataset.active
    }
    if (knobRef.current) knobRef.current.style.transform = ''
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto absolute inset-y-0 left-0 w-1/2"
      onPointerDown={start}
      onPointerMove={(event) => {
        if (track.current?.id === event.pointerId) steer(event.clientX, event.clientY)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div
        ref={baseRef}
        className="pointer-events-none absolute bottom-[max(1.75rem,env(safe-area-inset-bottom))] left-[max(1.75rem,env(safe-area-inset-left))] grid size-28 place-items-center rounded-full border border-foreground/20 bg-background/25 opacity-40 transition-opacity duration-200 data-[active=true]:opacity-100"
      >
        <div
          ref={knobRef}
          className="size-12 rounded-full border border-primary/60 bg-primary/20 shadow-[0_0_14px_rgb(0_0_0/0.35)] backdrop-blur-sm"
        />
      </div>
    </div>
  )
}

/** Right half: one finger drags the camera, two fingers pinch to zoom. */
function LookPad({ input }: { input: Input }) {
  const fingers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef(0)

  const spread = () => {
    const [a, b] = [...fingers.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const end = (event: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId)
    pinch.current = fingers.current.size === 2 ? spread() : 0
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-auto absolute inset-y-0 right-0 w-1/2"
      onPointerDown={(event) => {
        if (fingers.current.size >= 2) return
        fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        capture(event.currentTarget, event.pointerId)
        if (fingers.current.size === 2) pinch.current = spread()
      }}
      onPointerMove={(event) => {
        const finger = fingers.current.get(event.pointerId)
        if (!finger) return
        const dx = event.clientX - finger.x
        const dy = event.clientY - finger.y
        finger.x = event.clientX
        finger.y = event.clientY
        if (fingers.current.size === 1) {
          input.addLook(dx * LOOK_SCALE, dy * LOOK_SCALE)
          return
        }
        const next = spread()
        input.addZoom((pinch.current - next) * PINCH_SCALE)
        pinch.current = next
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    />
  )
}

interface PadButtonProps {
  label: string
  className?: string
  children: ReactNode
  onPress: () => void
  onRelease?: () => void
}

/** Acts on touch-down (no click delay) and holds until the finger lifts; keyboard / assistive activation also works. */
function PadButton({ label, className, children, onPress, onRelease }: PadButtonProps) {
  const pointer = useRef<number | null>(null)

  const release = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== event.pointerId) return
    pointer.current = null
    delete event.currentTarget.dataset.pressed
    onRelease?.()
  }

  return (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(event) => {
        event.preventDefault()
        if (pointer.current !== null) return
        pointer.current = event.pointerId
        event.currentTarget.dataset.pressed = 'true'
        capture(event.currentTarget, event.pointerId)
        onPress()
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (event.detail !== 0) return
        onPress()
        onRelease?.()
      }}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        'pointer-events-auto grid place-items-center rounded-full border border-foreground/25 bg-background/35 text-foreground/90 backdrop-blur-sm transition-transform duration-100 data-[pressed=true]:scale-90 data-[pressed=true]:border-primary/70 data-[pressed=true]:text-primary',
        className,
      )}
    >
      {children}
    </button>
  )
}
