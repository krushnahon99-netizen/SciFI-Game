import type * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import { DROWNED_BELL, GHOST_GARDEN } from '../world/layout'
import type { SleepingGiant } from '../world/structures/giant'
import { PROMPTS, SECRET_IDS } from './content'
import type { ProgressView, SecretId } from './ids'
import type { Interactables } from './interactables'

/** Standing this close (horizontal) to the Ghost Garden's centre finds it. */
const GARDEN_REACH = 7
/** A pulse sent this close to the Drowned Bell crater's centre finds it. */
const BELL_PULSE_REACH = DROWNED_BELL.radius * 0.75
/** Inspect reach around the Sleeping Giant's palm. */
const GIANT_REACH = 4.5

/**
 * Secret discovery → `secretFound` (progression shows the notice and saves). The Ghost Garden is found by standing in
 * it, the Drowned Bell by sending a pulse inside its crater, the Sleeping Giant by inspecting its palm while a pulse's
 * memory of it is showing (world/structures/giant.ts).
 */
export class Secrets {
  private readonly found = new Set<SecretId>()
  private readonly offPulse: () => void

  constructor(
    private readonly events: Emitter<GameEvents>,
    progress: ProgressView,
    interactables: Interactables,
    giant: SleepingGiant,
  ) {
    for (const id of SECRET_IDS) if (progress.has(id)) this.found.add(id)
    interactables.add({
      position: giant.palm,
      reach: GIANT_REACH,
      prompt: () => (giant.awake && !this.found.has('sleeping-giant') ? PROMPTS.inspect : null),
      interact: () => this.discover('sleeping-giant'),
    })
    this.offPulse = events.on('pulse', ({ origin }) => {
      if (Math.hypot(origin.x - DROWNED_BELL.x, origin.z - DROWNED_BELL.z) < BELL_PULSE_REACH) {
        this.discover('drowned-bell')
      }
    })
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
