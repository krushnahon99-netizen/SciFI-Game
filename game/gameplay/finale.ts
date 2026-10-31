import * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import { SPAWN } from '../world/layout'
import type { ListeningSpire } from '../world/structures/spire'
import type { HeartKey } from '../world/structures/undervault'
import { PROMPTS } from './content'
import type { ProgressView } from './ids'
import type { Interactable, Interactables } from './interactables'

/** What the finale asks of Game.ts. */
export interface FinaleHooks {
  /** Holds the camera on a shot, blending in at `rate` per second; input and interaction pause meanwhile. */
  shot(position: THREE.Vector3, target: THREE.Vector3, rate: number): void
  /** The Listening Stone's world pulse. */
  pulse(origin: THREE.Vector3): void
}

/** Horizontal reach (m): the Heart on its pedestal, the Spire gate, the Listening Stone. */
const REACH = { key: 2.8, gate: 4, stone: 3.2 }
/** Seconds the Stone takes to wake before its pulse leaves. */
const WAKE_TIME = 2.8
/** Seconds from the world pulse to `endingStart` (the wavefront has crossed most of the world by then). */
const SWEEP_TIME = 10
/** How awake the Stone stays after the finale (and in a completed save), and how fast it settles there. */
const AWAKE_AFTER = 0.55
const SETTLE_RATE = 0.05
/** First shot: over the explorer's shoulder at the waking Stone. */
const CLOSE = { back: 4.5, up: 2.4, look: 2.6, rate: 1.4 }
/**
 * Second shot: high behind the summit (above the vanes and the crown), looking ~20° down past them over the world
 * toward the Cradle as the pulse sweeps it; the horizon and the sky stay in frame.
 */
const WIDE = { back: 30, up: 40, ahead: 120, down: 15, rate: 0.45 }

/**
 * The last stretch of the journey. Take the Heart Key from the Undervault (`itemFound`), set it into the Listening
 * Spire's gate (the barrier opens, `spireOpened`), touch the Listening Stone (`finaleStart`): the Stone wakes, its
 * pulse sweeps the whole world under a cinematic camera, then `endingStart`. A save restores the key, the barrier
 * and the Stone at construction.
 */
export class Finale {
  private keyHeld: boolean
  /** The Heart floating in the gate once it has been set there. */
  private socketed: THREE.Object3D | null = null
  /** Seconds since the Stone was touched; negative until then. */
  private elapsed = -1
  private pulsed = false
  private ended = false
  private awake = 0

  constructor(
    private readonly scene: THREE.Scene,
    private readonly events: Emitter<GameEvents>,
    progress: ProgressView,
    private readonly key: HeartKey,
    private readonly spire: ListeningSpire,
    interactables: Interactables,
    /** The explorer's feet (live reference); frames the first shot. */
    private readonly player: THREE.Vector3,
    private readonly hooks: FinaleHooks,
  ) {
    this.keyHeld = progress.has('heart-key')
    if (this.keyHeld) key.take()
    if (progress.spireOpen) this.openBarrier(true)
    if (progress.completed) this.setAwake(AWAKE_AFTER)

    if (!this.keyHeld) {
      const take: Interactable = {
        position: key.position,
        reach: REACH.key,
        prompt: () => PROMPTS.takeHeartKey,
        interact: () => {
          interactables.remove(take)
          key.take()
          this.keyHeld = true
          events.emit('itemFound', { id: 'heart-key' })
        },
      }
      interactables.add(take)
    }
    if (!spire.barrier.isOpen) {
      const place: Interactable = {
        position: spire.gate,
        reach: REACH.gate,
        prompt: () => (this.keyHeld ? PROMPTS.placeHeartKey : null),
        interact: () => {
          interactables.remove(place)
          this.openBarrier(false)
          events.emit('spireOpened', {})
        },
      }
      interactables.add(place)
    }
    if (!progress.completed) {
      const touch: Interactable = {
        position: spire.stone,
        reach: REACH.stone,
        prompt: () => (spire.barrier.isOpen && this.elapsed < 0 ? PROMPTS.touchStone : null),
        interact: () => {
          interactables.remove(touch)
          this.begin()
        },
      }
      interactables.add(touch)
    }
  }

  /** The Stone was touched and the sequence hasn't reached `endingStart` yet. */
  get running(): boolean {
    return this.elapsed >= 0 && !this.ended
  }

  /** `dt` = play time (0 while paused); `time` = wall-clock seconds for the socketed Heart's idle motion. */
  update(dt: number, time: number) {
    const heart = this.socketed
    if (heart) {
      heart.position.y = this.spire.socket.y + Math.sin(time * 1.3) * 0.07
      heart.rotation.y = time * 0.5
      heart.children[1].rotation.x = time * 0.9
      heart.children[2].rotation.y = Math.PI / 2 + time * 1.4
    }
    if (this.elapsed < 0) return
    this.elapsed += dt
    if (this.ended) {
      if (this.awake > AWAKE_AFTER) this.setAwake(Math.max(AWAKE_AFTER, this.awake - dt * SETTLE_RATE))
      return
    }
    this.setAwake(THREE.MathUtils.smoothstep(this.elapsed, 0, WAKE_TIME))
    if (!this.pulsed && this.elapsed >= WAKE_TIME) this.release()
    if (this.elapsed >= WAKE_TIME + SWEEP_TIME) {
      this.ended = true
      this.events.emit('endingStart', {})
    }
  }

  /** Touched: the Stone starts waking under the first shot. */
  private begin() {
    this.elapsed = 0
    const stone = this.spire.stone
    this.events.emit('finaleStart', { position: { x: stone.x, y: stone.y, z: stone.z } })
    const back = new THREE.Vector3(this.player.x - stone.x, 0, this.player.z - stone.z)
    if (back.lengthSq() < 1e-4) back.set(0, 0, 1)
    back.normalize()
    const position = this.player.clone().addScaledVector(back, CLOSE.back)
    position.y += CLOSE.up
    this.hooks.shot(position, new THREE.Vector3(stone.x, stone.y + CLOSE.look, stone.z), CLOSE.rate)
  }

  /** Awake: the world pulse leaves the Stone and the camera rises to watch it cross the land. */
  private release() {
    this.pulsed = true
    const stone = this.spire.stone
    this.hooks.pulse(new THREE.Vector3(stone.x, stone.y + 0.6, stone.z))
    const out = new THREE.Vector3(SPAWN.x - stone.x, 0, SPAWN.z - stone.z).normalize()
    const position = stone.clone().addScaledVector(out, -WIDE.back)
    position.y += WIDE.up
    const target = stone.clone().addScaledVector(out, WIDE.ahead)
    target.y -= WIDE.down
    this.hooks.shot(position, target, WIDE.rate)
  }

  /** Opens the barrier and floats a copy of the Heart in the gate (`instant` on load). */
  private openBarrier(instant: boolean) {
    this.spire.barrier.open(instant)
    const heart = this.key.replica()
    heart.name = 'spire.heart'
    heart.position.copy(this.spire.socket)
    this.scene.add(heart)
    this.socketed = heart
  }

  private setAwake(level: number) {
    this.awake = level
    this.spire.setAwake(level)
  }
}
