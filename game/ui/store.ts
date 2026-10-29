/**
 * Framework-agnostic UI state shared between the engine and the React overlay.
 * The engine writes (throttled); React reads via useSyncExternalStore. No React or three.js here.
 */
import { Emitter } from '../core/events'

export type GamePhase = 'boot' | 'loading' | 'title' | 'intro' | 'playing' | 'paused' | 'ending' | 'end' | 'error'
export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'
export type LookMode = 'lock' | 'drag'

export interface Settings {
  quality: QualityLevel
  autoQuality: boolean
  renderScale: number
  masterVolume: number
  musicVolume: number
  sfxVolume: number
  muted: boolean
  sensitivity: number
  invertY: boolean
  showStats: boolean
}

export interface Toast {
  id: number
  kind: 'fragment' | 'secret' | 'puzzle' | 'info'
  title: string
  body?: string
}

export interface RenderStats {
  fps: number
  ms: number
  calls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
}

export interface JournalEntry {
  id: string
  title: string
  body: string
  region: string
}

export interface UIState {
  phase: GamePhase
  loading: { progress: number; label: string }
  error: string | null
  settings: Settings
  stats: RenderStats
  prompt: string | null
  objective: string
  regionBanner: { key: number; name: string; subtitle: string } | null
  toasts: Toast[]
  pulseCharge: number
  fragments: { found: number; total: number }
  secrets: { found: number; total: number }
  journal: JournalEntry[]
  discoveredRegions: string[]
  pointerLocked: boolean
  lookMode: LookMode
  isTouch: boolean
  hasSave: boolean
  caption: string | null
  endStats: { time: number; fragments: number; secrets: number; pulses: number } | null
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'high',
  autoQuality: true,
  renderScale: 1,
  masterVolume: 0.8,
  musicVolume: 0.7,
  sfxVolume: 0.9,
  muted: false,
  sensitivity: 1,
  invertY: false,
  showStats: false,
}

const SETTINGS_KEY = 'echo.settings.v1'

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function persistSettings(s: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    // Storage can be unavailable (private mode / sandboxed iframe); settings stay in memory.
  }
}

const initialState: UIState = {
  phase: 'boot',
  loading: { progress: 0, label: 'Waking the world' },
  error: null,
  settings: DEFAULT_SETTINGS,
  stats: { fps: 0, ms: 0, calls: 0, triangles: 0, geometries: 0, textures: 0, programs: 0 },
  prompt: null,
  objective: '',
  regionBanner: null,
  toasts: [],
  pulseCharge: 1,
  fragments: { found: 0, total: 0 },
  secrets: { found: 0, total: 0 },
  journal: [],
  discoveredRegions: [],
  pointerLocked: false,
  lookMode: 'lock',
  isTouch: false,
  hasSave: false,
  caption: null,
  endStats: null,
}

let state: UIState = initialState
let settingsHydrated = false
const listeners = new Set<() => void>()

export const echoStore = {
  getState: () => state,
  getServerState: () => initialState,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  set(patch: Partial<UIState>) {
    state = { ...state, ...patch }
    for (const fn of listeners) fn()
  },
  /** Loads persisted settings on the client once (kept out of SSR to avoid hydration mismatch). */
  hydrateSettings() {
    if (settingsHydrated) return
    settingsHydrated = true
    echoStore.set({ settings: loadSettings() })
  },
  updateSettings(patch: Partial<Settings>) {
    const settings = { ...state.settings, ...patch }
    persistSettings(settings)
    echoStore.set({ settings })
    commands.emit('settings', settings)
  },
}

let toastId = 1
export function pushToast(t: Omit<Toast, 'id'>, ttl = 4200) {
  const toast = { ...t, id: toastId++ }
  echoStore.set({ toasts: [...state.toasts, toast].slice(-4) })
  window.setTimeout(() => {
    echoStore.set({ toasts: state.toasts.filter((x) => x.id !== toast.id) })
  }, ttl)
}

/** Commands sent from the UI to the engine. */
export interface UICommands {
  newGame: Record<string, never>
  continueGame: Record<string, never>
  resume: Record<string, never>
  pause: Record<string, never>
  quitToTitle: Record<string, never>
  skipIntro: Record<string, never>
  keepExploring: Record<string, never>
  settings: Settings
  requestLook: Record<string, never>
  touchAction: { action: 'jump' | 'pulse' | 'interact' | 'run'; down: boolean }
}

export const commands = new Emitter<UICommands>()

/** Continuous touch input written directly by the on-screen controls (not React state). */
export const touchInput = {
  moveX: 0,
  moveY: 0,
  lookDX: 0,
  lookDY: 0,
}
