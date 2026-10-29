// No `three` import here: the React UI reads these presets without pulling the engine into its bundle.

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra']

export interface QualitySettings {
  level: QualityLevel
  label: string
  /** Upper bound for devicePixelRatio before the user's render-scale multiplier. */
  maxPixelRatio: number
  shadows: boolean
  shadowMapSize: number
  /** Half-size (m) of the square shadow frustum that follows the player. */
  shadowRadius: number
  bloom: boolean
  /** MSAA samples on the post-processing target (0 = off). */
  msaaSamples: number
  /** Camera far plane (m); fog hides the cut-off. */
  viewDistance: number
  /** Multiplier on terrain LOD switch distances. */
  terrainDetail: number
  /** Multiplier on instanced scatter (rocks, plants, debris). */
  scatterDensity: number
  /** Hard cap on simulated ambient particles. */
  particleBudget: number
  anisotropy: number
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualitySettings>> = {
  low: {
    level: 'low',
    label: 'Low',
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 512,
    shadowRadius: 35,
    bloom: false,
    msaaSamples: 0,
    viewDistance: 700,
    terrainDetail: 0.6,
    scatterDensity: 0.45,
    particleBudget: 300,
    anisotropy: 1,
  },
  medium: {
    level: 'medium',
    label: 'Medium',
    maxPixelRatio: 1.25,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 40,
    bloom: true,
    msaaSamples: 2,
    viewDistance: 1000,
    terrainDetail: 0.85,
    scatterDensity: 0.7,
    particleBudget: 800,
    anisotropy: 2,
  },
  high: {
    level: 'high',
    label: 'High',
    maxPixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 55,
    bloom: true,
    msaaSamples: 4,
    viewDistance: 1400,
    terrainDetail: 1,
    scatterDensity: 1,
    particleBudget: 1500,
    anisotropy: 4,
  },
  ultra: {
    level: 'ultra',
    label: 'Ultra',
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 4096,
    shadowRadius: 75,
    bloom: true,
    msaaSamples: 4,
    viewDistance: 1800,
    terrainDetail: 1.35,
    scatterDensity: 1.3,
    particleBudget: 2500,
    anisotropy: 8,
  },
}

/** First-run guess from coarse device hints; the renderer downgrades further on software GPUs. */
export function detectDefaultQuality(): QualityLevel {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'medium'
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const cores = navigator.hardwareConcurrency || 4
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  if (coarsePointer) return cores >= 8 && memory >= 6 ? 'medium' : 'low'
  if (cores < 4 || memory < 4) return 'medium'
  return 'high'
}
