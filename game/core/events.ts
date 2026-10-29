import type { QualityLevel } from '../render/quality'
import type { LookMode } from './input'

export type GamePhase = 'boot' | 'title' | 'intro' | 'playing' | 'paused' | 'ending'

/** Every engine-wide notification. Extend this interface as systems are added. */
export interface GameEvents {
  phase: { from: GamePhase; to: GamePhase }
  quality: { level: QualityLevel }
  pointerLock: { locked: boolean }
  lookMode: { mode: LookMode }
}

type Handler<T> = (payload: T) => void

/** Minimal typed pub/sub. Handlers are copied before dispatch so they may unsubscribe while running. */
export class Emitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<unknown>>()

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    set.add(handler)
    return () => this.off(type, handler)
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>) {
    this.handlers.get(type)?.delete(handler)
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]) {
    const set = this.handlers.get(type)
    if (!set) return
    for (const handler of [...set]) (handler as Handler<Events[K]>)(payload)
  }

  clear() {
    this.handlers.clear()
  }
}
