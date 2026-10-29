/** Procedurally synthesized tileable textures (no external assets). */
import * as THREE from 'three'
import { tfbm2, tworley, smoothstep } from './noise'

function finishTexture(tex: THREE.DataTexture, anisotropy: number) {
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = anisotropy
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  return tex
}

function normalizeChannel(src: Float32Array) {
  let mn = Infinity
  let mx = -Infinity
  for (const v of src) {
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const inv = 1 / Math.max(1e-6, mx - mn)
  for (let i = 0; i < src.length; i++) src[i] = (src[i] - mn) * inv
}

/**
 * RGBA noise atlas:
 *  R: medium fBm, G: fine fBm, B: Worley cell edges (0 at cracks), A: broad fBm.
 */
export function createNoiseTexture(size: number, anisotropy: number): THREE.DataTexture {
  const n = size * size
  const r = new Float32Array(n)
  const g = new Float32Array(n)
  const b = new Float32Array(n)
  const a = new Float32Array(n)
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const i = y * size + x
      r[i] = tfbm2(u * 8, v * 8, 8, 5)
      g[i] = tfbm2(u * 32 + 3.1, v * 32 + 7.7, 32, 3)
      b[i] = smoothstep(0, 0.16, tworley(u * 10, v * 10, 10)[1])
      a[i] = tfbm2(u * 4 + 11.3, v * 4 + 5.1, 4, 3)
    }
  }
  normalizeChannel(r)
  normalizeChannel(g)
  normalizeChannel(a)
  const data = new Uint8Array(n * 4)
  for (let i = 0; i < n; i++) {
    data[i * 4] = r[i] * 255
    data[i * 4 + 1] = g[i] * 255
    data[i * 4 + 2] = b[i] * 255
    data[i * 4 + 3] = a[i] * 255
  }
  return finishTexture(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), anisotropy)
}

/** Tileable detail normal map: pitted stone + fine cracks. */
export function createDetailNormalTexture(size: number, anisotropy: number): THREE.DataTexture {
  const h = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    const v = y / size
    for (let x = 0; x < size; x++) {
      const u = x / size
      const fb = tfbm2(u * 16 + 1.7, v * 16 + 9.2, 16, 4)
      const edge = tworley(u * 14 + 0.5, v * 14 + 0.5, 14)[1]
      const crack = 1 - smoothstep(0, 0.09, edge)
      h[y * size + x] = fb * 0.6 - crack * 0.45
    }
  }
  const data = new Uint8Array(size * size * 4)
  const strength = 2.2
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength
      const l = Math.hypot(dx, dy, 1)
      const i = (y * size + x) * 4
      data[i] = (-dx / l * 0.5 + 0.5) * 255
      data[i + 1] = (-dy / l * 0.5 + 0.5) * 255
      data[i + 2] = (1 / l * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }
  return finishTexture(new THREE.DataTexture(data, size, size, THREE.RGBAFormat), anisotropy)
}

/** Soft round sprite used by particles. */
export function createSoftDotTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5
      const dy = (y + 0.5) / size - 0.5
      const d = Math.hypot(dx, dy) * 2
      const v = Math.max(0, 1 - d)
      const i = (y * size + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.pow(v, 1.8) * 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}
