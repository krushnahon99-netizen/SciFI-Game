import * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'

export type ReactiveKind = 'glyphs' | 'ghosts' | 'pastState' | 'crystals' | 'phase' | 'trigger'

/** A pulse as seen by reactive objects. */
export interface PulseInfo {
  readonly origin: THREE.Vector3
  /** Emission time on the EchoSystem play clock. */
  readonly time: number
  /** Wavefront speed (m/s). */
  readonly speed: number
  /** The wavefront reaches nothing beyond this distance (m). */
  readonly radius: number
}

/**
 * Anything the echo pulse affects. The registry calls `hit` when the wavefront reaches the bounding sphere's edge;
 * multi-part objects compute later per-part arrivals themselves with `arrivalAt`.
 */
export interface Reactive {
  readonly kind: ReactiveKind
  readonly center: THREE.Vector3
  readonly radius: number
  hit(pulse: PulseInfo, arrival: number): void
  /** Called every frame after a hit while it returns true (play clock; dt is 0 while paused). */
  update?(clock: number, dt: number): boolean
  /** Declared as null by objects that can warn before they fade (phase objects); `add()` wires it to `phaseWarn`. */
  onWarn?: ((center: THREE.Vector3) => void) | null
}

/** Play-clock time the wavefront reaches (x, y, z), or Infinity when the point lies beyond the pulse radius. */
export function arrivalAt(pulse: PulseInfo, x: number, y: number, z: number): number {
  const distance = Math.hypot(x - pulse.origin.x, y - pulse.origin.y, z - pulse.origin.z)
  return distance > pulse.radius ? Infinity : pulse.time + distance / pulse.speed
}

/** Fade-in / hold / fade-out envelope that later hits extend instead of restarting. */
export class RevealTimer {
  start = -Infinity
  until = -Infinity

  constructor(
    readonly hold: number,
    readonly fadeIn: number,
    readonly fadeOut: number,
  ) {}

  /** Returns true when this hit starts a new showing (the previous one had fully faded). */
  trigger(arrival: number): boolean {
    const fresh = arrival > this.until + this.fadeOut
    if (fresh) this.start = arrival
    this.until = Math.max(this.until, arrival + this.hold)
    return fresh
  }

  amount(clock: number): number {
    if (clock < this.start) return 0
    const fadeIn = THREE.MathUtils.smoothstep(clock, this.start, this.start + this.fadeIn)
    return fadeIn * (1 - THREE.MathUtils.smoothstep(clock, this.until, this.until + this.fadeOut))
  }

  done(clock: number): boolean {
    return clock > this.until + this.fadeOut
  }
}

interface PendingHit {
  at: number
  item: Reactive
  pulse: PulseInfo
}

/**
 * Pulse → reactive objects. On each pulse every registered object gets one bounding-sphere distance test (pulses are
 * rare, so a flat list is cheaper than a spatial index); hits are queued by arrival time and delivered when the
 * wavefront gets there. Only objects with running animations are updated per frame.
 */
export class ReactiveRegistry {
  private readonly items: Reactive[] = []
  private readonly pending: PendingHit[] = []
  private readonly active = new Set<Reactive>()
  private readonly unsubscribe: () => void

  constructor(private readonly events: Emitter<GameEvents>) {
    this.unsubscribe = events.on('pulse', ({ origin, time, speed, radius }) =>
      this.schedule({ origin: new THREE.Vector3(origin.x, origin.y, origin.z), time, speed, radius }),
    )
  }

  add<T extends Reactive>(item: T): T {
    this.items.push(item)
    const reactive: Reactive = item
    if (reactive.onWarn === null) {
      reactive.onWarn = ({ x, y, z }) => this.events.emit('phaseWarn', { position: { x, y, z } })
    }
    return item
  }

  update(clock: number, dt: number) {
    let due = 0
    while (due < this.pending.length && this.pending[due].at <= clock) due++
    if (due > 0) {
      for (const { item, pulse, at } of this.pending.splice(0, due)) {
        item.hit(pulse, at)
        if (item.update) this.active.add(item)
        const { x, y, z } = item.center
        this.events.emit('reactiveHit', { kind: item.kind, position: { x, y, z }, time: at })
      }
    }
    for (const item of this.active) if (!item.update?.(clock, dt)) this.active.delete(item)
  }

  dispose() {
    this.unsubscribe()
    this.items.length = 0
    this.pending.length = 0
    this.active.clear()
  }

  private schedule(pulse: PulseInfo) {
    for (const item of this.items) {
      const gap = pulse.origin.distanceTo(item.center) - item.radius
      if (gap > pulse.radius) continue
      this.pending.push({ at: pulse.time + Math.max(0, gap) / pulse.speed, item, pulse })
    }
    this.pending.sort((a, b) => a.at - b.at)
  }
}
