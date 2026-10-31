import * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import type { PulseWave } from '../echo/pulseShader'
import type { World } from '../world/world'
import { PROMPTS } from './content'
import type { ProgressView } from './ids'
import type { Interactables } from './interactables'

/** The Listening Stone's wave: fast, and wide enough to reach every corner of the world from the Spire. */
export const FINALE_WAVE: PulseWave = { speed: 50, radius: 600 }

/** Horizontal reach (m) of the three endgame interactions. */
const REACH = { key: 2.8, gate: 4, stone: 2.8 }
/** The key floats ~2.5 m over the chamber floor; anchor the prompt lower so it is in vertical reach from the floor. */
const KEY_ANCHOR_DROP = 1
/** Finale timeline, in play seconds after the Stone is touched. */
const TIMELINE = { wake: 2.6, pulse: 2.6, craneStart: 3.4, craneEnd: 10.5, ending: 12.5 }
/** The wide shot looks from behind the summit toward the middle of the world. */
const VIEW_TARGET = { x: -40, z: 70 }
/** Camera blend from the explorer's camera into the first pose (per second). */
const SHOT_RATE = 1.1

/** Camera pose in cylindrical coordinates around the Stone, so the crane orbits the summit instead of cutting through it. */
interface Pose {
  angle: number
  radius: number
  height: number
  target: THREE.Vector3
}

export interface FinaleHooks {
  /** Holds the camera on a cinematic pose (called every frame while the finale runs). */
  shot(position: THREE.Vector3, target: THREE.Vector3, rate: number): void
  /** Sends the world wave from `origin`, ignoring the pulse cooldown. */
  pulse(origin: THREE.Vector3): void
}

/**
 * The endgame chain: take the Heart Key from the Undervault shrine (`itemFound`), bring it to the Spire barrier's gate
 * (the barrier opens), touch the Listening Stone → `finaleStart`; the Stone wakes and sends one wave across the whole
 * world (every memory answers), the camera cranes out over it, then `endingStart`. Restored on load: a held key leaves
 * the shrine dark and the barrier open; a completed journey keeps the Stone awake (touching it again replays the finale).
 */
export class Finale {
  /** Play seconds since the Stone was touched; -1 while idle. */
  private time = -1
  private pulsed = false
  private awake: number
  private readonly close: Pose
  private readonly wide: Pose
  private readonly position = new THREE.Vector3()
  private readonly target = new THREE.Vector3()

  constructor(
    private readonly world: World,
    private readonly events: Emitter<GameEvents>,
    progress: ProgressView,
    interactables: Interactables,
    private readonly hooks: FinaleHooks,
  ) {
    const { key } = world.undervault
    const { barrier, stone, gate } = world.spire
    if (progress.has('heart-key')) {
      key.take()
      barrier.open(true)
    }
    this.awake = progress.completed ? 1 : 0
    world.spire.setAwake(this.awake)

    // Close: inside the ring on the gate side, looking up past the explorer at the Stone and the vanes.
    this.close = {
      angle: Math.atan2(gate.z - stone.z, gate.x - stone.x),
      radius: 7.5,
      height: 1.4,
      target: stone.clone().setY(stone.y + 4),
    }
    // Wide: high behind the summit, looking out over the world the wave is crossing.
    const toWorld = new THREE.Vector3(VIEW_TARGET.x - stone.x, 0, VIEW_TARGET.z - stone.z).normalize()
    this.wide = {
      angle: Math.atan2(-toWorld.z, -toWorld.x),
      radius: 18,
      height: 15,
      target: stone.clone().addScaledVector(toWorld, 140).setY(stone.y - 32),
    }

    interactables.add({
      position: key.position.clone().setY(key.position.y - KEY_ANCHOR_DROP),
      reach: REACH.key,
      prompt: () => (key.taken ? null : PROMPTS.takeHeartKey),
      interact: () => {
        if (key.taken) return
        key.take()
        this.events.emit('itemFound', { id: 'heart-key' })
      },
    })
    interactables.add({
      position: gate,
      reach: REACH.gate,
      prompt: () => (key.taken && !barrier.isOpen ? PROMPTS.placeHeartKey : null),
      interact: () => {
        if (key.taken) barrier.open()
      },
    })
    interactables.add({
      position: stone,
      reach: REACH.stone,
      prompt: () => (barrier.isOpen && this.time < 0 ? PROMPTS.touchStone : null),
      interact: () => this.begin(),
    })
  }

  get running(): boolean {
    return this.time >= 0
  }

  /** `dt` is play time (0 while paused). */
  update(dt: number) {
    if (this.time < 0) return
    this.time += dt
    const t = this.time
    if (this.awake < 1) {
      this.awake = Math.min(1, this.awake + dt / TIMELINE.wake)
      this.world.spire.setAwake(this.awake)
    }
    if (!this.pulsed && t >= TIMELINE.pulse) {
      this.pulsed = true
      this.hooks.pulse(this.world.spire.stone)
    }
    this.frame(THREE.MathUtils.smoothstep(t, TIMELINE.craneStart, TIMELINE.craneEnd))
    if (t >= TIMELINE.ending) {
      this.time = -1
      this.events.emit('endingStart', {})
    }
  }

  /** Abandons a running finale (e.g. back to the title mid-sequence); the Stone stays as awake as it got. */
  cancel() {
    this.time = -1
  }

  private begin() {
    if (this.time >= 0) return
    this.time = 0
    this.pulsed = false
    const { x, y, z } = this.world.spire.stone
    this.events.emit('finaleStart', { position: { x, y, z } })
  }

  /** Camera between the close (s = 0) and wide (s = 1) poses, orbiting the shorter way round. */
  private frame(s: number) {
    const { close, wide } = this
    const stone = this.world.spire.stone
    const turn = Math.atan2(Math.sin(wide.angle - close.angle), Math.cos(wide.angle - close.angle))
    const angle = close.angle + turn * s
    const radius = THREE.MathUtils.lerp(close.radius, wide.radius, s)
    this.position.set(
      stone.x + Math.cos(angle) * radius,
      stone.y + THREE.MathUtils.lerp(close.height, wide.height, s),
      stone.z + Math.sin(angle) * radius,
    )
    this.target.lerpVectors(close.target, wide.target, s)
    this.hooks.shot(this.position, this.target, SHOT_RATE)
  }
}
