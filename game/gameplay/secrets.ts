import type * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import { DROWNED_BELL, GHOST_GARDEN } from '../world/layout'
import type { SleepingGiant } from '../world/structures/giant'
import { PROMPTS, SECRET_IDS } from './content'
import type { ProgressView, SecretId } from './ids'
import type { Interactable, Interactables } from './interactables'

/** Standing this close (horizontal) to the Ghost Garden's centre finds it. */
const GARDEN_REACH = 7
/** A pulse sent this close to the Drowned Bell crater's centre finds it. */
const BELL_PULSE_REACH = DROWNED_BELL.radius * 0.75
/** The Sleeping Giant is huge: it can be inspected from this far in front of its face... */
const GIANT_REACH = 5
/** ...but only while a pulse keeps it stirring (eyes lit). */
const GIANT_AWAKE = 0.3

/**
 * Secret discovery → `secretFound` (progression shows the notice and saves). The Ghost Garden is found by standing in
 * it, the Drowned Bell by sending a pulse inside its crater, the Sleeping Giant by inspecting its face (E) while a
 * pulse has it stirring.
 */
export class Secrets {
  private readonly found = new Set<SecretId>()
  private readonly offPulse: () => void

  constructor(
    private readonly events: Emitter<GameEvents>,
    progress: ProgressView,
    giant: SleepingGiant,
    interactables: Interactables,
  ) {
    for (const id of SECRET_IDS) if (progress.has(id)) this.found.add(id)
    this.offPulse = events.on('pulse', ({ origin }) => {
      if (Math.hypot(origin.x - DROWNED_BELL.x, origin.z - DROWNED_BELL.z) < BELL_PULSE_REACH) {
        this.discover('drowned-bell')
      }
    })
    if (!this.found.has('sleeping-giant')) {
      const inspect: Interactable = {
        position: giant.face,
        reach: GIANT_REACH,
        prompt: () => (giant.awake > GIANT_AWAKE ? PROMPTS.inspect : null),
        interact: () => {
          this.discover('sleeping-giant')
          interactables.remove(inspect)
        },
      }
      interactables.add(inspect)
    }
  }

  /** `player` = the explorer's position while playing, else null. */
  update(player: THREE.Vector3 | null) {
    if (!player) return
    if (Math.hypot(player.x - GHOST_GARDEN.x, player.z - GHOST_GARDEN.z) < GARDEN_REACH) this.discover('ghost-garden')
  }

  dispose() {
    this.offPulse()
  }

  private discover(id: SecretId) {
    if (this.found.has(id)) return
    this.found.add(id)
    this.events.emit('secretFound', { id })
  }
}
