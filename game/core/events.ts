/** Minimal typed event emitter used for engine ↔ systems ↔ UI communication. */
export class Emitter<T extends { [K in keyof T]: unknown }> {
  private listeners = new Map<keyof T, Set<(payload: never) => void>>()

  on<K extends keyof T>(type: K, fn: (payload: T[K]) => void): () => void {
    let set = this.listeners.get(type)
    if (!set) {
      set = new Set()
      this.listeners.set(type, set)
    }
    set.add(fn as (payload: never) => void)
    return () => set.delete(fn as (payload: never) => void)
  }

  emit<K extends keyof T>(type: K, payload: T[K]) {
    const set = this.listeners.get(type)
    if (!set) return
    for (const fn of set) (fn as (p: T[K]) => void)(payload)
  }

  clear() {
    this.listeners.clear()
  }
}

export interface Vec3Like {
  x: number
  y: number
  z: number
}

/** Gameplay events consumed by audio, UI and progression. */
export interface GameEvents {
  pulse: { origin: Vec3Like }
  footstep: { surface: 'sand' | 'stone' | 'metal' | 'glass'; run: boolean }
  jump: Record<string, never>
  land: { speed: number }
  respawn: Record<string, never>
  crystal: { position: Vec3Like; pitch: number }
  collect: { id: string }
  secret: { id: string }
  puzzleStep: { id: string; step: number }
  puzzleSolved: { id: string }
  puzzleFail: { id: string }
  region: { id: string }
  reveal: { kind: string; position: Vec3Like }
  door: { id: string; position: Vec3Like }
  ui: { kind: 'click' | 'open' | 'close' | 'toast' }
  ending: Record<string, never>
}
