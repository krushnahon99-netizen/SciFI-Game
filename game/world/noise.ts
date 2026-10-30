/** Deterministic CPU noise for world generation. Pure and seedable, so every run builds the same world. */

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

/** Value noise in [0, 1). */
export function valueNoise2(x: number, z: number, seed = 0): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const u = fade(x - ix)
  const v = fade(z - iz)
  const a = hash2(ix, iz, seed)
  const b = hash2(ix + 1, iz, seed)
  const c = hash2(ix, iz + 1, seed)
  const d = hash2(ix + 1, iz + 1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Fractal value noise in roughly [-1, 1]. Each octave is rotated to hide the lattice. */
export function fbm2(x: number, z: number, octaves = 5, seed = 0): number {
  let sum = 0
  let amplitude = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * (valueNoise2(x, z, seed + i * 101) * 2 - 1)
    norm += amplitude
    amplitude *= 0.5
    const rx = x * 1.6 - z * 1.2
    z = x * 1.2 + z * 1.6
    x = rx
  }
  return sum / norm
}

/** Ridged multifractal in [0, 1]: sharp crests, smooth troughs. */
export function ridged2(x: number, z: number, octaves = 4, seed = 0): number {
  let sum = 0
  let amplitude = 0.5
  let norm = 0
  let weight = 1
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(valueNoise2(x, z, seed + i * 131) * 2 - 1)
    n *= n
    sum += n * amplitude * weight
    norm += amplitude
    weight = Math.min(1, n * 1.6)
    amplitude *= 0.5
    const rx = x * 1.6 - z * 1.2
    z = x * 1.2 + z * 1.6
    x = rx
  }
  return sum / norm
}

/** mulberry32: small fast seeded RNG returning [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
