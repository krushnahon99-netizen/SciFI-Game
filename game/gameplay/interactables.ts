import type * as THREE from 'three'
import { uiStore } from '../ui/store'

/** Something the explorer can use with Interact (E) while standing close enough. */
export interface Interactable {
  /** Anchor in world space; reach is measured on the ground plane from here. */
  readonly position: THREE.Vector3
  /** Horizontal reach (m). */
  readonly reach: number
  /** Prompt text (a `PROMPTS` entry from content.ts), or null while it can't be used. */
  prompt(): string | null
  interact(): void
}

/** Max height difference between the explorer's feet and an interactable's anchor. */
const VERTICAL_REACH = 2.6

/**
 * Each frame: picks the closest usable interactable within reach, publishes its prompt (`uiStore.interactPrompt`)
 * and runs it when Interact was pressed.
 */
export class Interactables {
  private readonly items: Interactable[] = []

  add<T extends Interactable>(item: T): T {
    this.items.push(item)
    return item
  }

  remove(item: Interactable) {
    const index = this.items.indexOf(item)
    if (index >= 0) this.items.splice(index, 1)
  }

  /** `from` = the explorer's feet, or null while interaction is off (not playing, cinematic camera, free cam). */
  update(from: THREE.Vector3 | null, pressed: boolean) {
    let best: Interactable | null = null
    let prompt: string | null = null
    if (from) {
      let bestDistance = Infinity
      for (const item of this.items) {
        const p = item.position
        if (Math.abs(p.y - from.y) > VERTICAL_REACH) continue
        const distance = Math.hypot(p.x - from.x, p.z - from.z)
        if (distance > item.reach || distance >= bestDistance) continue
        const text = item.prompt()
        if (text === null) continue
        best = item
        bestDistance = distance
        prompt = text
      }
    }
    if (pressed && best) {
      best.interact()
      prompt = best.prompt()
    }
    uiStore.setState({ interactPrompt: prompt })
  }

  dispose() {
    this.items.length = 0
    uiStore.setState({ interactPrompt: null })
  }
}
