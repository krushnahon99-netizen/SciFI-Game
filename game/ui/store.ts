// Engine → React bridge. Plain TypeScript (no React, no three) so both sides can import it cheaply.
// The engine writes on events or throttled timers, never per frame; React reads via useSyncExternalStore.
import type { GamePhase } from '../core/events'
import type { LookMode } from '../core/input'
import type { RegionId } from '../gameplay/ids'
import type { Notice, ProgressSnapshot } from '../gameplay/progression'
import type { QualityLevel } from '../render/quality'

export interface PerfSnapshot {
  fps: number
  frameMs: number
  cpuMs: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  pixelRatio: number
  gpu: string
}

export interface UIState {
  booted: boolean
  fatalError: string | null
  phase: GamePhase
  pointerLocked: boolean
  lookMode: LookMode
  showPerf: boolean
  perf: PerfSnapshot
  quality: QualityLevel
  renderScale: number
  /** Echo pulse charge: 0 right after a pulse … 1 ready (quantised by the engine). */
  pulseCharge: number

  // --- Lane A fields (docs/coordination.md §4) ---
  /** Region the player is in, set on `regionEnter`; drives the HUD region title. */
  region: RegionId | null
  /** Interaction hint, e.g. "Activate pillar"; null hides it. */
  interactPrompt: string | null

  // --- Lane B fields ---
  /** Saved progress for the objective, journal and end screen (gameplay/progression.ts); null before boot. */
  progress: ProgressSnapshot | null
  /** Discovery notices, oldest first; the HUD removes each one after showing it. */
  notices: readonly Notice[]
  /** Master volume 0–1 and mute (pause menu; M toggles mute). */
  volume: number
  muted: boolean
  /** Title screen: a save worth continuing exists (read when the Game starts). */
  canContinue: boolean
  /** Intro line on screen (index into INTRO.lines), −1 between lines. */
  introLine: number
}

type Listener = () => void

export interface Store<T> {
  getState(): T
  getInitialState(): T
  setState(patch: Partial<T> | ((state: T) => Partial<T>)): void
  subscribe(listener: Listener): () => void
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial
  const listeners = new Set<Listener>()
  return {
    getState: () => state,
    getInitialState: () => initial,
    setState(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch
      let changed = false
      for (const key in next) {
        if (!Object.is(next[key], state[key])) {
          changed = true
          break
        }
      }
      if (!changed) return
      state = { ...state, ...next }
      listeners.forEach((listener) => listener())
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const uiStore = createStore<UIState>({
  booted: false,
  fatalError: null,
  phase: 'boot',
  pointerLocked: false,
  lookMode: 'pointer-lock',
  showPerf: false,
  perf: { fps: 0, frameMs: 0, cpuMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0, pixelRatio: 1, gpu: '' },
  quality: 'high',
  renderScale: 1,
  pulseCharge: 1,

  // --- Lane A ---
  region: null,
  interactPrompt: null,

  // --- Lane B ---
  progress: null,
  notices: [],
  volume: 0.8,
  muted: false,
  canContinue: false,
  introLine: -1,
})
