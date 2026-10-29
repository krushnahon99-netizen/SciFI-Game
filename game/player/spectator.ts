import * as THREE from 'three'
import type { Input } from '../core/input'

const LOOK_RADIANS_PER_PIXEL = 0.0025
const FLY_SPEED = 14
const FAST_FLY_SPEED = 45
const PITCH_LIMIT = Math.PI / 2 - 0.05

/** Free-flying camera used to inspect the world before the player controller exists (replaced in M1c). */
export class Spectator {
  private yaw: number
  private pitch: number
  private readonly velocity = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    position: THREE.Vector3,
    yaw = 0,
    pitch = -0.12,
  ) {
    this.yaw = yaw
    this.pitch = pitch
    camera.rotation.order = 'YXZ'
    camera.position.copy(position)
    camera.rotation.set(pitch, yaw, 0)
  }

  update(dt: number, input: Input, groundHeight: (x: number, z: number) => number = () => 0) {
    this.yaw -= input.lookDelta.x * LOOK_RADIANS_PER_PIXEL
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookDelta.y * LOOK_RADIANS_PER_PIXEL, -PITCH_LIMIT, PITCH_LIMIT)

    const axis = input.getMoveAxis()
    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    const vertical = (input.isDown('jump') ? 1 : 0) - (input.isDown('descend') ? 1 : 0)
    // forward = (-sin, 0, -cos), right = (cos, 0, -sin)
    this.wish.set(cos * axis.x - sin * axis.y, vertical, -sin * axis.x - cos * axis.y)
    if (this.wish.lengthSq() > 1) this.wish.normalize()
    this.wish.multiplyScalar(input.isDown('run') ? FAST_FLY_SPEED : FLY_SPEED)
    this.velocity.lerp(this.wish, 1 - Math.exp(-8 * dt))

    const position = this.camera.position
    position.addScaledVector(this.velocity, dt)
    position.y = Math.max(position.y, groundHeight(position.x, position.z) + 1.2)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }
}
