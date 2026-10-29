/**
 * Deterministic noise + RNG utilities shared by terrain generation, scattering and procedural
 * texture synthesis. Everything is seeded so the world is identical on every load.
 * Pure TypeScript (no three.js) so it can also be used by headless checks.
 */

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** GLSL-style smoothstep; also works with reversed edges (e0 > e1). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

const perm = new Uint8Array(512)
const gradX = new Float32Array(256)
const gradY = new Float32Array(256)

;(function initNoise(seed: number) {
  const rng = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
  for (let i = 0; i < 256; i++) {
    const a = rng() * Math.PI * 2
    gradX[i] = Math.cos(a)
    gradY[i] = Math.sin(a)
  }
})(1337)

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function gradDot(h: number, x: number, y: number) {
  return gradX[h] * x + gradY[h] * y
}

/** 2D gradient noise, roughly in [-1, 1]. Repeats every 256 units. */
export function noise2(x: number, y: number): number {
  const xf = Math.floor(x)
  const yf = Math.floor(y)
  const fx = x - xf
  const fy = y - yf
  const X = xf & 255
  const Y = yf & 255
  const aa = perm[perm[X] + Y]
  const ab = perm[perm[X] + Y + 1]
  const ba = perm[perm[X + 1] + Y]
  const bb = perm[perm[X + 1] + Y + 1]
  const u = fade(fx)
  const v = fade(fy)
  const x1 = lerp(gradDot(aa, fx, fy), gradDot(ba, fx - 1, fy), u)
  const x2 = lerp(gradDot(ab, fx, fy - 1), gradDot(bb, fx - 1, fy - 1), u)
  return lerp(x1, x2, v) * 1.4142
}

/** Periodic gradient noise that tiles every `period` lattice units (period <= 256). */
export function tnoise2(x: number, y: number, period: number): number {
  const xf = Math.floor(x)
  const yf = Math.floor(y)
  const fx = x - xf
  const fy = y - yf
  const x0 = ((xf % period) + period) % period
  const y0 = ((yf % period) + period) % period
  const x1 = (x0 + 1) % period
  const y1 = (y0 + 1) % period
  const aa = perm[perm[x0] + y0]
  const ab = perm[perm[x0] + y1]
  const ba = perm[perm[x1] + y0]
  const bb = perm[perm[x1] + y1]
  const u = fade(fx)
  const v = fade(fy)
  const a = lerp(gradDot(aa, fx, fy), gradDot(ba, fx - 1, fy), u)
  const b = lerp(gradDot(ab, fx, fy - 1), gradDot(bb, fx - 1, fy - 1), u)
  return lerp(a, b, v) * 1.4142
}

/** Fractal Brownian motion, normalized to roughly [-1, 1]. */
export function fbm2(x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x * f + i * 17.17, y * f - i * 9.31) * amp
    norm += amp
    amp *= gain
    f *= lacunarity
  }
  return sum / norm
}

/** Ridged multifractal in [0, ~1] — sharp crests for mountains and cliffs. */
export function ridged2(x: number, y: number, octaves = 4): number {
  let sum = 0
  let amp = 0.5
  let f = 1
  let prev = 1
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(noise2(x * f + i * 5.3, y * f - i * 7.1))
    n *= n
    sum += n * amp * prev
    prev = n
    amp *= 0.5
    f *= 2
  }
  return sum * 1.6
}

/** Tileable fBm over a square texture domain; `period` is the lattice period of the first octave. */
export function tfbm2(x: number, y: number, period: number, octaves = 4, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let f = 1
  for (let i = 0; i < octaves; i++) {
    sum += tnoise2(x * f, y * f, Math.min(256, period * f)) * amp
    norm += amp
    amp *= gain
    f *= 2
  }
  return sum / norm
}

function hash2(ix: number, iy: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/**
 * Tileable Worley noise. Returns [F1, F2-F1] — the second value is small near cell edges,
 * which reads as cracks / cell boundaries.
 */
export function tworley(x: number, y: number, period: number): [number, number] {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  let f1 = 9
  let f2 = 9
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = xi + ox
      const cy = yi + oy
      const wx = ((cx % period) + period) % period
      const wy = ((cy % period) + period) % period
      const px = cx + hash2(wx, wy)
      const py = cy + hash2(wx + 91, wy + 37)
      const d = Math.hypot(px - x, py - y)
      if (d < f1) {
        f2 = f1
        f1 = d
      } else if (d < f2) {
        f2 = d
      }
    }
  }
  return [f1, f2 - f1]
}
