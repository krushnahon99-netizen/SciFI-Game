import * as THREE from 'three'
import type { Input } from '../core/input'
import type { Collision } from '../physics/collision'

const LOOK_RADIANS_PER_PIXEL = 0.0025
const PITCH_MIN = -1.15
const PITCH_MAX = 0.55
/** Slightly below level by default, so the sky (and the planet) stays in view. */
const DEFAULT_PITCH = -0.1
const PIVOT_HEIGHT = 1.55
const SHOULDER_OFFSET = 0.42
const MIN_DISTANCE = 2.2
const MAX_DISTANCE = 9
const DEFAULT_DISTANCE = 5.2
const WHEEL_STEP = 0.6
const CAMERA_MARGIN = 0.3

/** Third-person orbit rig: mouse/touch look, shoulder offset, terrain/collider avoidance, cinematic override. */
export class CameraRig {
  yaw: number
  pitch = DEFAULT_PITCH
  private distance = DEFAULT_DISTANCE
  private current = DEFAULT_DISTANCE
  private initialized = false
  private readonly pivot = new THREE.Vector3()
  private readonly shoulder = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()

  private cinematic: { position: THREE.Vector3; target: THREE.Vector3 } | null = null
  private cinematicWeight = 0
  private cinematicRate = 1.5
  private readonly gameplayQuat = new THREE.Quaternion()
  private readonly cinematicQuat = new THREE.Quaternion()
  private readonly gameplayPos = new THREE.Vector3()
  private readonly lookMatrix = new THREE.Matrix4()
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ')

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly collision: Collision,
    yaw: number,
  ) {
    this.yaw = yaw
    camera.rotation.order = 'YXZ'
  }

  get inCinematic(): boolean {
    return this.cinematic !== null || this.cinematicWeight > 0.001
  }

  /** Look/zoom input; call before the player update so movement uses this frame's yaw. */
  applyLook(input: Input) {
    this.yaw -= input.lookDelta.x * LOOK_RADIANS_PER_PIXEL
    this.pitch = THREE.MathUtils.clamp(this.pitch - input.lookDelta.y * LOOK_RADIANS_PER_PIXEL, PITCH_MIN, PITCH_MAX)
    if (input.wheel !== 0) {
      this.distance = THREE.MathUtils.clamp(this.distance + input.wheel * WHEEL_STEP, MIN_DISTANCE, MAX_DISTANCE)
    }
  }

  /** Blend to a fixed shot (position looking at target); `rate` is the blend speed per second. */
  setCinematic(position: THREE.Vector3, target: THREE.Vector3, rate = 1.5) {
    this.cinematic = { position: position.clone(), target: target.clone() }
    this.cinematicRate = rate
  }

  clearCinematic(rate = 1.5) {
    this.cinematic = null
    this.cinematicRate = rate
  }

  /** Places the camera behind `target` (the player's feet). */
  update(dt: number, target: THREE.Vector3) {
    const pivot = this.pivot
    if (!this.initialized) {
      pivot.set(target.x, target.y + PIVOT_HEIGHT, target.z)
      this.initialized = true
    } else {
      const kh = 1 - Math.exp(-22 * dt)
      const kv = 1 - Math.exp(-9 * dt)
      pivot.x += (target.x - pivot.x) * kh
      pivot.z += (target.z - pivot.z) * kh
      pivot.y += (target.y + PIVOT_HEIGHT - pivot.y) * kv
    }

    const cp = Math.cos(this.pitch)
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    const side = this.collision.clearance(pivot, this.shoulder.copy(pivot).addScaledVector(this.right, SHOULDER_OFFSET), 0.2)
    this.shoulder.copy(pivot).addScaledVector(this.right, SHOULDER_OFFSET * side)
    this.desired.copy(this.shoulder).addScaledVector(this.forward, -this.distance)
    const allowed = this.distance * this.collision.clearance(this.shoulder, this.desired, CAMERA_MARGIN)
    // Pull in immediately when blocked, ease back out when clear.
    this.current = allowed < this.current ? allowed : this.current + (allowed - this.current) * (1 - Math.exp(-3 * dt))
    this.current = Math.max(this.current, 0.4)

    this.gameplayPos.copy(this.shoulder).addScaledVector(this.forward, -this.current)
    this.gameplayQuat.setFromEuler(this.euler.set(this.pitch, this.yaw, 0, 'YXZ'))

    const goal = this.cinematic ? 1 : 0
    this.cinematicWeight += (goal - this.cinematicWeight) * (1 - Math.exp(-this.cinematicRate * 2 * dt))
    if (Math.abs(goal - this.cinematicWeight) < 0.001) this.cinematicWeight = goal

    if (this.cinematic && this.cinematicWeight > 0) {
      const w = this.cinematicWeight * this.cinematicWeight * (3 - 2 * this.cinematicWeight)
      this.lookMatrix.lookAt(this.cinematic.position, this.cinematic.target, THREE.Object3D.DEFAULT_UP)
      this.cinematicQuat.setFromRotationMatrix(this.lookMatrix)
      this.camera.position.lerpVectors(this.gameplayPos, this.cinematic.position, w)
      this.camera.quaternion.slerpQuaternions(this.gameplayQuat, this.cinematicQuat, w)
    } else {
      this.camera.position.copy(this.gameplayPos)
      this.camera.quaternion.copy(this.gameplayQuat)
    }
  }
}
