import { QUALITY_LEVELS, detectDefaultQuality, type QualityLevel } from '../render/quality'
import { storage } from './storage'

export interface Settings {
  quality: QualityLevel
  /** True once the player picked a preset; automatic downgrades never override an explicit choice. */
  qualityExplicit: boolean
  /** Multiplier on the preset's pixel ratio (0.5–1). */
  renderScale: number
  /** Master volume 0–1. */
  volume: number
  muted: boolean
}

const SETTINGS_KEY = 'echo.settings.v1'
export const DEFAULT_VOLUME = 0.8

export function loadSettings(): Settings {
  const saved = storage.get<Partial<Settings>>(SETTINGS_KEY, {})
  const validQuality = saved.quality !== undefined && QUALITY_LEVELS.includes(saved.quality)
  const scale = saved.renderScale
  const volume = saved.volume
  return {
    quality: validQuality && saved.quality ? saved.quality : detectDefaultQuality(),
    qualityExplicit: validQuality && saved.qualityExplicit === true,
    renderScale: typeof scale === 'number' && scale >= 0.5 && scale <= 1 ? scale : 1,
    volume: typeof volume === 'number' && volume >= 0 && volume <= 1 ? volume : DEFAULT_VOLUME,
    muted: saved.muted === true,
  }
}

export function saveSettings(settings: Settings) {
  storage.set(SETTINGS_KEY, settings)
}
