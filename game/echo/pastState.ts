import * as THREE from 'three'
import { createHologramMaterial } from './hologram'
import { RevealTimer, type PulseInfo, type Reactive } from './reactive'

/** Seconds for the hologram to build from the ground to the top. */
const BUILD = 1.8
const HOLD = 8
const FADE_OUT = 1.6

/**
 * The intact past form of a ruin as a memory hologram: hidden (no draw cost) until a pulse reaches it, then it builds
 * upward, holds, and dissolves. Pass a group of meshes; their materials are replaced.
 */
export class PastStateOverlay implements Reactive {
  readonly kind = 'pastState' as const
  readonly center = new THREE.Vector3()
  readonly radius: number
  private readonly material = createHologramMaterial('#9fe2ff', 1.1)
  private readonly timer = new RevealTimer(HOLD, 0.15, FADE_OUT)
  private readonly baseY: number
  private readonly topY: number

  constructor(
    scene: THREE.Scene,
    private readonly root: THREE.Object3D,
  ) {
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) (object as THREE.Mesh).material = this.material
    })
    root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(root)
    bounds.getCenter(this.center)
    this.radius = bounds.getSize(new THREE.Vector3()).length() / 2
    this.baseY = bounds.min.y
    this.topY = bounds.max.y
    root.visible = false
    scene.add(root)
  }

  hit(_pulse: PulseInfo, arrival: number) {
    this.timer.trigger(arrival)
  }

  update(clock: number): boolean {
    const done = this.timer.done(clock)
    this.root.visible = !done
    const uniforms = this.material.uniforms
    uniforms.uReveal.value = this.timer.amount(clock)
    const built = THREE.MathUtils.smoothstep(clock - this.timer.start, 0, BUILD)
    uniforms.uSweepY.value = this.baseY + (this.topY - this.baseY + 1) * built
    return !done
  }
}
