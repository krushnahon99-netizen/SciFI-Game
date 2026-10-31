import * as THREE from 'three'
import type { Input } from '../core/input'
import type { Collision } from '../physics/collision'

export const PLAYER_RADIUS = 0.36
export const PLAYER_HEIGHT = 1.8

const WALK_SPEED = 4.5
const RUN_SPEED = 8
const GROUND_ACCEL = 30
const AIR_ACCEL = 6
const JUMP_SPEED = 6.2
const GRAVITY = 20
const MAX_FALL_SPEED = 40
const COYOTE_TIME = 0.12
const JUMP_BUFFER = 0.12
/** Ground steeper than this can't be walked up or jumped from; the player slides off it. */
const MAX_SLOPE_COS = Math.cos(THREE.MathUtils.degToRad(40))
const SLIDE_ACCEL = 16
/** Keeps the player glued to the ground when walking down slopes and over small bumps. */
const GROUND_SNAP = 0.5
const STEP_UP = 0.45
const TURN_RATE = 12

const approach = (value: number, target: number, maxDelta: number) =>
  value < target ? Math.min(value + maxDelta, target) : Math.max(value - maxDelta, target)

function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

/** Third-person character controller: walk/run/jump on the heightmap and collider tops, with a slope limit. */
export class Player {
  /** Feet position. */
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  /** Facing yaw (same convention as the camera: 0 looks toward −z). */
  facing: number
  grounded = true
  /** Standing on ground too steep to walk (sliding). */
  steep = false
  running = false
  /** Seconds spent airborne (0 while grounded). */
  airTime = 0
  /** Downward speed at the moment of landing this frame, else 0. */
  landingSpeed = 0
  jumpedThisFrame = false
  /** Yaw change per second, for the avatar's turn lean. */
  turnRate = 0

  private coyote = 0
  private jumpBuffer = 0
  private readonly normal = new THREE.Vector3(0, 1, 0)

  constructor(
    private readonly collision: Collision,
    spawn: { x: number; z: number; yaw: number },
  ) {
    this.facing = spawn.yaw
    this.teleport(spawn.x, spawn.z, spawn.yaw)
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  /** Feet on the ground, or on the collider top under (x, z) when there is one (e.g. the Undervault landing). */
  teleport(x: number, z: number, yaw = this.facing) {
    this.position.set(x, Math.max(this.collision.groundHeight(x, z), this.collision.topAt(x, z)), z)
    this.velocity.set(0, 0, 0)
    this.facing = yaw
    this.grounded = true
    this.steep = false
  }

  /** `input` is null while input is blocked (cinematics); movement is relative to `cameraYaw`. */
  update(dt: number, input: Input | null, cameraYaw: number) {
    const v = this.velocity
    const p = this.position
    this.jumpedThisFrame = false
    this.landingSpeed = 0

    // Desired horizontal velocity. forward = (−sin, −cos), right = (cos, −sin) for a yaw.
    const axis = input ? input.getMoveAxis() : { x: 0, y: 0 }
    const sin = Math.sin(cameraYaw)
    const cos = Math.cos(cameraYaw)
    let wx = cos * axis.x - sin * axis.y
    let wz = -sin * axis.x - cos * axis.y
    const amount = Math.min(1, Math.hypot(wx, wz))
    if (amount > 1e-3) {
      const inv = 1 / Math.hypot(wx, wz)
      wx *= inv
      wz *= inv
    }
    this.running = !!input?.isDown('run') && amount > 0.1
    const speed = (this.running ? RUN_SPEED : WALK_SPEED) * amount

    if (input?.wasPressed('jump')) this.jumpBuffer = JUMP_BUFFER
    else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt)

    const onFirmGround = this.grounded && !this.steep
    const accel = (onFirmGround ? GROUND_ACCEL : AIR_ACCEL) * dt
    const tx = wx * speed
    const tz = wz * speed
    if (onFirmGround || amount > 1e-3) {
      // Accelerate toward the target velocity (in the air only while steering, so jumps keep momentum).
      const ex = tx - v.x
      const ez = tz - v.z
      const e = Math.hypot(ex, ez)
      if (e > 1e-5) {
        const k = Math.min(1, accel / e)
        v.x += ex * k
        v.z += ez * k
      }
    }

    if (this.grounded && this.steep) {
      // Slide down; the normal's horizontal part points downhill.
      const n = this.normal
      const h = Math.hypot(n.x, n.z) || 1
      v.x += (n.x / h) * SLIDE_ACCEL * dt
      v.z += (n.z / h) * SLIDE_ACCEL * dt
    }

    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.steep) {
      v.y = JUMP_SPEED
      this.grounded = false
      this.coyote = 0
      this.jumpBuffer = 0
      this.jumpedThisFrame = true
    }

    v.y = Math.max(v.y - GRAVITY * dt, -MAX_FALL_SPEED)
    const oldX = p.x
    const oldZ = p.z
    p.x += v.x * dt
    p.z += v.z * dt
    p.y += v.y * dt

    // Steep terrain blocks uphill motion: remove the uphill part of this frame's move.
    const terrainNormal = this.collision.groundNormal(p.x, p.z, this.normal)
    const terrainHere = this.collision.groundHeight(p.x, p.z)
    if (terrainNormal.y < MAX_SLOPE_COS && p.y <= terrainHere + GROUND_SNAP) {
      const h = Math.hypot(terrainNormal.x, terrainNormal.z) || 1
      const ux = -terrainNormal.x / h
      const uz = -terrainNormal.z / h
      const uphill = (p.x - oldX) * ux + (p.z - oldZ) * uz
      if (uphill > 0) {
        p.x -= ux * uphill
        p.z -= uz * uphill
        const vu = v.x * ux + v.z * uz
        if (vu > 0) {
          v.x -= ux * vu
          v.z -= uz * vu
        }
      }
    }

    const support = this.collision.resolveCharacter(p, PLAYER_RADIUS, PLAYER_HEIGHT, STEP_UP)
    const terrain = this.collision.groundHeight(p.x, p.z)
    const groundY = Math.max(terrain, support)
    const snap = this.grounded && v.y <= 0 ? GROUND_SNAP : 0
    const wasGrounded = this.grounded

    if (v.y <= 0 && p.y <= groundY + snap) {
      if (!wasGrounded) this.landingSpeed = -v.y
      p.y = groundY
      v.y = 0
      this.grounded = true
    } else {
      if (p.y < groundY) {
        p.y = groundY
        v.y = Math.max(v.y, 0)
      }
      this.grounded = false
    }

    if (this.grounded) {
      if (support >= terrain) {
        this.normal.set(0, 1, 0)
        this.steep = false
      } else {
        this.collision.groundNormal(p.x, p.z, this.normal)
        this.steep = this.normal.y < MAX_SLOPE_COS
      }
      this.coyote = this.steep ? 0 : COYOTE_TIME
      this.airTime = 0
    } else {
      this.coyote = Math.max(0, this.coyote - dt)
      this.airTime += dt
    }

    // Turn toward the movement direction.
    const previousFacing = this.facing
    const hs = this.horizontalSpeed
    if (amount > 0.1 && hs > 0.3) {
      const targetYaw = Math.atan2(-v.x, -v.z)
      const delta = wrapAngle(targetYaw - this.facing)
      this.facing = wrapAngle(this.facing + delta * Math.min(1, TURN_RATE * dt))
    }
    this.turnRate = dt > 0 ? approach(this.turnRate, wrapAngle(this.facing - previousFacing) / dt, 30 * dt) : 0
  }
}
