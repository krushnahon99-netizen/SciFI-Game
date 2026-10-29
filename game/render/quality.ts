import type { QualityLevel } from '../ui/store'

export interface QualityPreset {
  level: QualityLevel
  label: string
  maxDpr: number
  msaa: number
  shadows: boolean
  shadowMapSize: number
  shadowExtent: number
  terrainShadows: boolean
  bloom: boolean
  bloomScale: number
  lodScale: number
  scatterDensity: number
  scatterDistance: number
  particles: number
  cloudOctaves: number
  detailNormals: boolean
}

export const QUALITY_ORDER: QualityLevel[] = ['low', 'medium', 'high', 'ultra']

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    label: 'Low',
    maxDpr: 1,
    msaa: 0,
    shadows: false,
    shadowMapSize: 512,
    shadowExtent: 30,
    terrainShadows: false,
    bloom: false,
    bloomScale: 0.5,
    lodScale: 0.6,
    scatterDensity: 0.35,
    scatterDistance: 120,
    particles: 250,
    cloudOctaves: 2,
    detailNormals: false,
  },
  medium: {
    level: 'medium',
    label: 'Medium',
    maxDpr: 1.25,
    msaa: 0,
    shadows: true,
    shadowMapSize: 1024,
    shadowExtent: 40,
    terrainShadows: false,
    bloom: true,
    bloomScale: 0.5,
    lodScale: 0.85,
    scatterDensity: 0.65,
    scatterDistance: 170,
    particles: 700,
    cloudOctaves: 3,
    detailNormals: true,
  },
  high: {
    level: 'high',
    label: 'High',
    maxDpr: 1.5,
    msaa: 4,
    shadows: true,
    shadowMapSize: 2048,
    shadowExtent: 55,
    terrainShadows: true,
    bloom: true,
    bloomScale: 0.5,
    lodScale: 1,
    scatterDensity: 1,
    scatterDistance: 230,
    particles: 1400,
    cloudOctaves: 4,
    detailNormals: true,
  },
  ultra: {
    level: 'ultra',
    label: 'Ultra',
    maxDpr: 2,
    msaa: 4,
    shadows: true,
    shadowMapSize: 4096,
    shadowExtent: 70,
    terrainShadows: true,
    bloom: true,
    bloomScale: 0.75,
    lodScale: 1.35,
    scatterDensity: 1,
    scatterDistance: 320,
    particles: 2400,
    cloudOctaves: 5,
    detailNormals: true,
  },
}

/** Initial guess before auto-quality has measured anything. */
export function guessQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'high'
  const ua = navigator.userAgent
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua))
  if (mobile) return 'low'
  const cores = navigator.hardwareConcurrency ?? 4
  if (cores <= 4) return 'medium'
  return 'high'
}
