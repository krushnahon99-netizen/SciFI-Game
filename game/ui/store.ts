// Engine → React bridge. Plain TypeScript (no React, no three) so both sides can import it cheaply.
// The engine writes on events or throttled timers, never per frame; React reads via useSyncExternalStore.
import type { GamePhase } from '../core/events'
import type { LookMode } from '../core/input'
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
})
