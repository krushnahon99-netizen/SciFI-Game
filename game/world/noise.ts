/**
 * Deterministic noise + math helpers shared by terrain, mountains and procedural textures.
 * Everything is seeded, so the world is identical on every load.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Hermite smoothstep. Reversed edges (e0 > e1) give a falling step; fine in JS, undefined in GLSL. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}

const PERM = new Uint8Array(512)
const GX = new Float32Array(256)
const GY = new Float32Array(256)
const RAND = new Float32Array(256)

{
  const rand = mulberry32(0xec40)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
  for (let i = 0; i < 256; i++) {
    const a = rand() * Math.PI * 2
    GX[i] = Math.cos(a)
    GY[i] = Math.sin(a)
    RAND[i] = rand()
  }
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

/** Seeded 2D gradient noise, roughly in [-1, 1]. A power-of-two `period` (≤ 256) makes it tile. */
export function noise(x: number, y: number, period = 256): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const m = period - 1
  const x0 = ix & m
  const y0 = iy & m
  const x1 = (x0 + 1) & m
  const y1 = (y0 + 1) & m
  const a = PERM[x0]
  const b = PERM[x1]
  const h00 = PERM[a + y0]
  const h10 = PERM[b + y0]
  const h01 = PERM[a + y1]
  const h11 = PERM[b + y1]
  const n00 = GX[h00] * fx + GY[h00] * fy
  const n10 = GX[h10] * (fx - 1) + GY[h10] * fy
  const n01 = GX[h01] * fx + GY[h01] * (fy - 1)
  const n11 = GX[h11] * (fx - 1) + GY[h11] * (fy - 1)
  const u = fade(fx)
  const v = fade(fy)
  const nx0 = n00 + (n10 - n00) * u
  const nx1 = n01 + (n11 - n01) * u
  return (nx0 + (nx1 - nx0) * v) * 1.4142
}

const ROT_C = Math.cos(0.646)
const ROT_S = Math.sin(0.646)

/** Fractal sum of `noise`, rotated ~37° and doubled per octave. Roughly [-1, 1]. */
export function fbm(x: number, y: number, octaves = 5, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x, y)
    norm += amp
    const nx = (ROT_C * x - ROT_S * y) * 2 + 31.7
    y = (ROT_S * x + ROT_C * y) * 2 - 12.3
    x = nx
    amp *= gain
  }
  return sum / norm
}

/** Ridged multifractal in [0, 1]: sharp crests where the noise crosses zero. */
export function ridged(x: number, y: number, octaves = 5, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x, y))
    sum += amp * n * n
    norm += amp
    const nx = (ROT_C * x - ROT_S * y) * 2 + 7.9
    y = (ROT_S * x + ROT_C * y) * 2 + 21.4
    x = nx
    amp *= gain
  }
  return sum / norm
}

/** Tileable fbm over u, v ∈ [0, 1); `period` lattice cells per tile at the first octave (power of two). */
export function fbmTile(u: number, v: number, period: number, octaves = 5, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let p = period
  for (let i = 0; i < octaves && p <= 256; i++) {
    sum += amp * noise(u * p + i * 17, v * p + i * 29, p)
    norm += amp
    amp *= gain
    p *= 2
  }
  return sum / norm
}

/** Tileable ridged noise in [0, 1]. */
export function ridgedTile(u: number, v: number, period: number, octaves = 4, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let p = period
  for (let i = 0; i < octaves && p <= 256; i++) {
    const n = 1 - Math.abs(noise(u * p + i * 41, v * p + i * 13, p))
    sum += amp * n * n
    norm += amp
    amp *= gain
    p *= 2
  }
  return sum / norm
}

/** Tileable Worley (cellular) F1 distance in [0, 1]; `period` cells per tile (power of two ≤ 256). */
export function worleyTile(u: number, v: number, period: number): number {
  const x = u * period
  const y = v * period
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  const m = period - 1
  let best = 4
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const h = PERM[PERM[(cx + i) & m] + ((cy + j) & m)]
      const dx = cx + i + RAND[h] - x
      const dy = cy + j + RAND[(h + 101) & 255] - y
      const d = dx * dx + dy * dy
      if (d < best) best = d
    }
  }
  return Math.min(1, Math.sqrt(best))
}
