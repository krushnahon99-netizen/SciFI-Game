import type * as THREE from 'three'
import { RevealTimer, type PulseInfo, type Reactive } from './reactive'

export interface GlowSpec {
  /** Emissive intensity at rest and at full glow. */
  rest: number
  peak: number
  hold: number
  fadeIn: number
  fadeOut: number
}

/**
 * Emissive materials that brighten for a while once a pulse's wavefront reaches them (the Sleeping Giant's eyes,
 * the Drowned Bell's bands). `amount` tells gameplay how lit they are right now.
 */
export class PulseGlow implements Reactive {
  readonly kind = 'trigger' as const
  private readonly timer: RevealTimer
  private level = 0

  constructor(
    readonly center: THREE.Vector3,
    readonly radius: number,
    private readonly materials: readonly THREE.MeshStandardMaterial[],
    private readonly spec: GlowSpec,
  ) {
    this.timer = new RevealTimer(spec.hold, spec.fadeIn, spec.fadeOut)
    this.apply(0)
  }

  /** 0..1 glow right now. */
  get amount(): number {
    return this.level
  }

  hit(_pulse: PulseInfo, arrival: number) {
    this.timer.trigger(arrival)
  }

  update(clock: number): boolean {
    const done = this.timer.done(clock)
    this.apply(done ? 0 : this.timer.amount(clock))
    return !done
  }

  private apply(level: number) {
    this.level = level
    const { rest, peak } = this.spec
    for (const material of this.materials) material.emissiveIntensity = rest + (peak - rest) * level
  }
}
