import type { ReactiveKind } from '../echo/reactive'
import type { FragmentId, ItemId, PuzzleId, RegionId, SecretId, Surface } from '../gameplay/ids'
import type { QualityLevel } from '../render/quality'
import type { LookMode } from './input'

export type GamePhase = 'boot' | 'title' | 'intro' | 'playing' | 'paused' | 'ending'

/** Every engine-wide notification. Extend this interface as systems are added. */
export interface GameEvents {
  phase: { from: GamePhase; to: GamePhase }
  quality: { level: QualityLevel }
  pointerLock: { locked: boolean }
  lookMode: { mode: LookMode }
  /** An echo pulse left its emitter. `time` is on the EchoSystem play clock; `slot` is its shader slot. */
  pulse: { origin: { x: number; y: number; z: number }; time: number; slot: number }
  /** The wavefront reached a reactive object (echo/reactive.ts); `time` is the arrival on the play clock. */
  reactiveHit: { kind: ReactiveKind; position: { x: number; y: number; z: number }; time: number }

  // --- Lane A (world & gameplay) emits these; see docs/coordination.md §4 ---
  regionEnter: { id: RegionId }
  footstep: { surface: Surface; run: boolean }
  /** Touchdown after a fall; `impact` is the downward speed in m/s. */
  land: { impact: number }
  /** One puzzle input (pillar activated, node charged…); `ok: false` = wrong step, puzzle reset. `index`: pillar 0–3, node 0–2. */
  puzzleStep: { id: PuzzleId; ok: boolean; index?: number }
  /** A ghost singer sings pillar `index` during the Choir replay (fires from M3c). */
  choirNote: { index: number; position: { x: number; y: number; z: number } }
  /** A phase object starts its expiry flicker (fires from M3c: Glass Bridge, Ghost Garden stones). */
  phaseWarn: { position: { x: number; y: number; z: number } }
  /** The Listening Stone was activated and the finale pulse begins (fires from M3d); `endingStart` follows. */
  finaleStart: { position: { x: number; y: number; z: number } }
  puzzleSolved: { id: PuzzleId }
  fragmentFound: { id: FragmentId }
  secretFound: { id: SecretId }
  itemFound: { id: ItemId }
  /** The player fell below `FALL_LIMIT` and was put back at the spawn point of `region` (the current one). */
  respawn: { region: RegionId }
  /** The finale pulse has finished; Game.ts switches to the 'ending' phase. */
  endingStart: Record<string, never>

  // --- Lane B (systems & UI) adds its events below ---
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
