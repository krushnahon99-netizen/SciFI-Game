import * as THREE from 'three'
import { Polyline, type Point2 } from '../world/layout'
import { createHologramMaterial } from './hologram'
import { RevealTimer, type PulseInfo, type Reactive } from './reactive'

export type GhostPose = 'stand' | 'walk' | 'kneel' | 'sing' | 'reach'

export interface GhostActor {
  /** XZ waypoints; a single point keeps the ghost in place. */
  path: readonly Point2[]
  /** Pose while walking (default 'walk'), or the whole time when stationary (default 'stand'). */
  pose?: GhostPose
  /** Pose after reaching the end of the path (default 'stand'). */
  endPose?: GhostPose
  /** Faces this point whenever it isn't walking. */
  lookAt?: Point2
  /** Walking speed (m/s). */
  speed?: number
  /** Seconds after the scene appears before this ghost starts walking. */
  delay?: number
  scale?: number
}

interface PoseParams {
  bodyY: number
  lean: number
  armL: number
  armR: number
  spread: number
  robe: number
}

// Arms hang from the shoulders: negative x rotation swings them forward / up. The figure faces local +z.
const POSES: Record<GhostPose, PoseParams> = {
  stand: { bodyY: 1.05, lean: 0, armL: -0.08, armR: -0.08, spread: 0.08, robe: 1 },
  walk: { bodyY: 1.05, lean: 0.06, armL: 0, armR: 0, spread: 0.1, robe: 1 },
  kneel: { bodyY: 0.55, lean: 0.38, armL: -0.75, armR: -0.75, spread: 0.06, robe: 0.55 },
  sing: { bodyY: 1.08, lean: -0.12, armL: -2.75, armR: -2.75, spread: 0.45, robe: 1 },
  reach: { bodyY: 1.05, lean: 0.1, armL: -0.1, armR: -1.45, spread: 0.1, robe: 1 },
}
const POSE_KEYS = Object.keys(POSES.stand) as (keyof PoseParams)[]

const FADE_IN = 0.9
const HOLD = 9
const FADE_OUT = 1.8
/** Walk-cycle radians per metre (a stride of ~1.4 m). */
const STRIDE = 2.2

interface GhostGeometry {
  robe: THREE.BufferGeometry
  torso: THREE.BufferGeometry
  head: THREE.BufferGeometry
  arm: THREE.BufferGeometry
}

function createGhostGeometry(): GhostGeometry {
  return {
    robe: new THREE.CylinderGeometry(0.2, 0.48, 1.3, 14).translate(0, 0.65, 0),
    torso: new THREE.CapsuleGeometry(0.19, 0.46, 4, 10).translate(0, 0.45, 0),
    head: new THREE.SphereGeometry(0.16, 16, 12).translate(0, 1.04, 0),
    arm: new THREE.CapsuleGeometry(0.055, 0.6, 4, 8).translate(0, -0.33, 0),
  }
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** A tall robed figure of the lost civilisation, posed procedurally. */
class GhostFigure {
  readonly root = new THREE.Group()
  yaw = 0
  private readonly body = new THREE.Group()
  private readonly robe: THREE.Mesh
  private readonly armL = new THREE.Group()
  private readonly armR = new THREE.Group()
  private readonly current: PoseParams = { ...POSES.stand }

  constructor(
    geometry: GhostGeometry,
    material: THREE.Material,
    scale: number,
    private readonly seed: number,
  ) {
    this.robe = new THREE.Mesh(geometry.robe, material)
    this.armL.position.set(0.27, 0.72, 0)
    this.armR.position.set(-0.27, 0.72, 0)
    this.armL.add(new THREE.Mesh(geometry.arm, material))
    this.armR.add(new THREE.Mesh(geometry.arm, material))
    this.body.position.y = POSES.stand.bodyY
    this.body.add(new THREE.Mesh(geometry.torso, material), new THREE.Mesh(geometry.head, material), this.armL, this.armR)
    this.root.add(this.robe, this.body)
    this.root.scale.setScalar(scale)
  }

  /** `blend` = 1 snaps to the pose. */
  pose(pose: GhostPose, blend: number, walkPhase: number, walking: boolean, time: number) {
    const target = POSES[pose]
    const c = this.current
    for (const key of POSE_KEYS) c[key] += (target[key] - c[key]) * blend
    const swing = walking ? Math.sin(walkPhase) : 0
    const idle = Math.sin(time * 1.3 + this.seed) * 0.03
    this.body.position.y = c.bodyY + (walking ? Math.abs(Math.cos(walkPhase)) * 0.05 : idle * 0.5)
    this.body.rotation.x = c.lean
    this.armL.rotation.set(c.armL + swing * 0.5 + idle, 0, c.spread)
    this.armR.rotation.set(c.armR - swing * 0.5 + idle, 0, -c.spread)
    this.robe.scale.y = c.robe
    this.robe.rotation.z = swing * 0.04
  }
}

interface ActorState {
  actor: GhostActor
  figure: GhostFigure
  line: Polyline | null
}

/** A memory: ghosts replaying a moment from the past for a few seconds after the wavefront reaches them. */
export class GhostScene implements Reactive {
  readonly kind = 'ghosts' as const
  readonly center = new THREE.Vector3()
  readonly radius: number
  private readonly root = new THREE.Group()
  private readonly material = createHologramMaterial()
  private readonly geometry = createGhostGeometry()
  private readonly actors: ActorState[] = []
  private readonly timer: RevealTimer
  private fresh = false
  private readonly point = { x: 0, z: 0 }
  private readonly ahead = { x: 0, z: 0 }

  constructor(
    scene: THREE.Scene,
    actors: readonly GhostActor[],
    private readonly heightAt: (x: number, z: number) => number,
    name = 'echo.ghosts',
    /** Envelope override, e.g. the Choir's short-lived singers (gameplay/puzzles.ts drives those itself). */
    timing: { hold?: number; fadeIn?: number; fadeOut?: number } = {},
  ) {
    this.timer = new RevealTimer(timing.hold ?? HOLD, timing.fadeIn ?? FADE_IN, timing.fadeOut ?? FADE_OUT)
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    actors.forEach((actor, index) => {
      const figure = new GhostFigure(this.geometry, this.material, actor.scale ?? 1, index * 2.17)
      this.root.add(figure.root)
      this.actors.push({ actor, figure, line: actor.path.length > 1 ? new Polyline(actor.path) : null })
      for (const [x, z] of actor.path) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minZ = Math.min(minZ, z)
        maxZ = Math.max(maxZ, z)
      }
    })
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    this.center.set(cx, heightAt(cx, cz) + 1, cz)
    this.radius = Math.hypot(maxX - minX, maxZ - minZ) / 2 + 2
    this.root.name = name
    this.root.visible = false
    scene.add(this.root)
  }

  hit(_pulse: PulseInfo, arrival: number) {
    if (this.timer.trigger(arrival)) this.fresh = true
  }

  update(clock: number, dt: number): boolean {
    if (this.timer.done(clock)) {
      this.root.visible = false
      return false
    }
    const reveal = this.timer.amount(clock)
    this.material.uniforms.uReveal.value = reveal
    this.root.visible = reveal > 0.001
    const blend = this.fresh ? 1 : 1 - Math.exp(-dt * 5)
    const t = clock - this.timer.start
    for (const state of this.actors) this.place(state, t, blend, clock)
    this.fresh = false
    return true
  }

  private place({ actor, figure, line }: ActorState, t: number, blend: number, clock: number) {
    const p = this.point
    let s = 0
    let walking = false
    let arrived = false
    let yaw = figure.yaw
    if (line) {
      const delay = actor.delay ?? 0
      s = THREE.MathUtils.clamp((t - delay) * (actor.speed ?? 1.1), 0, line.length)
      arrived = s >= line.length - 1e-3
      walking = t > delay && !arrived
      line.pointAt(s, p)
      if (!arrived) {
        line.pointAt(Math.min(s + 0.4, line.length), this.ahead)
        yaw = Math.atan2(this.ahead.x - p.x, this.ahead.z - p.z)
      }
    } else {
      p.x = actor.path[0][0]
      p.z = actor.path[0][1]
    }
    if (!walking && actor.lookAt && (arrived || !line)) yaw = Math.atan2(actor.lookAt[0] - p.x, actor.lookAt[1] - p.z)
    figure.yaw = blend >= 1 ? yaw : figure.yaw + wrapAngle(yaw - figure.yaw) * blend
    figure.root.position.set(p.x, this.heightAt(p.x, p.z), p.z)
    figure.root.rotation.y = figure.yaw
    const pose: GhostPose = line
      ? arrived
        ? (actor.endPose ?? 'stand')
        : walking
          ? (actor.pose ?? 'walk')
          : 'stand'
      : (actor.pose ?? 'stand')
    figure.pose(pose, blend, s * STRIDE, walking, clock)
  }
}
