import * as THREE from 'three'
import { patchWorldMaterial } from '../render/shaderChunks'
import { PLANET_NOTCH, SUN_AZIMUTH, SUN_DIRECTION } from './layout'
import { lerp, ridged, smoothstep as ss } from './noise'
import { planetNotch, rimHeight, type Terrain } from './terrain'

// Inner edge is buried under the rim plateau, so there's no gap at the square heightmap's edge or corners.
const INNER = 340
const OUTER = 1250
const SEGMENTS = 288
const RINGS = 30
const STRIDE = RINGS + 1

const MOUNTAIN_COLOR = /* glsl */ `
  vec3 mN = normalize(vWorldNormal);
  vec4 mA = texture(uEchoNoise, vWorldPos.xz * 0.0021);
  vec4 mB = texture(uEchoNoise, vWorldPos.xz * 0.0097 + 0.4);
  float mFlat = smoothstep(0.55, 0.85, mN.y + (mB.r - 0.5) * 0.2);
  vec3 mRock = mix(vec3(0.05, 0.045, 0.045), vec3(0.15, 0.12, 0.105), mA.r * 0.7 + mB.a * 0.3);
  diffuseColor.rgb = mix(mRock, vec3(0.16, 0.125, 0.1) * (0.85 + 0.3 * mB.g), mFlat * 0.8);
`

/** Polar ring of distant ranges (lower toward the sun) with baked per-vertex sun visibility. */
export function createMountains(terrain: Terrain): THREE.Mesh {
  const radii = new Float32Array(STRIDE)
  for (let k = 0; k <= RINGS; k++) radii[k] = INNER + (OUTER - INNER) * Math.pow(k / RINGS, 1.5)

  const heights = new Float32Array(SEGMENTS * STRIDE)
  const positions = new Float32Array(SEGMENTS * STRIDE * 3)
  for (let s = 0; s < SEGMENTS; s++) {
    const theta = (s / SEGMENTS) * Math.PI * 2
    const c = Math.cos(theta)
    const sn = Math.sin(theta)
    const scale =
      lerp(0.35, 1, ss(0.04, 0.42, 0.5 - 0.5 * Math.cos(theta - SUN_AZIMUTH))) *
      lerp(PLANET_NOTCH.mountainScale, 1, planetNotch(theta))
    const base = rimHeight(theta) - 6
    for (let k = 0; k <= RINGS; k++) {
      const r = radii[k]
      const t = (r - INNER) / (OUTER - INNER)
      const x = c * r
      const z = sn * r
      // Ranges rise with distance, so they read as layered silhouettes instead of a wall behind the rim.
      const peaks = (30 + 160 * ridged(x / 210 + 1.7, z / 210 - 3.2, 5)) * scale
      const rise = ss(0, 0.07, t) * (0.35 + 0.65 * ss(0.06, 0.5, t))
      const h = base + rise * peaks
      const i = s * STRIDE + k
      heights[i] = h
      positions[i * 3] = x
      positions[i * 3 + 1] = h
      positions[i * 3 + 2] = z
    }
  }

  // Ground height for the sun march: terrain inside, bilinear polar grid outside (fast).
  const groundAt = (x: number, z: number): number => {
    const r = Math.hypot(x, z)
    if (r < INNER) return terrain.heightAt(x, z)
    if (r >= OUTER) return -Infinity
    let a = Math.atan2(z, x)
    if (a < 0) a += Math.PI * 2
    const fs = (a / (Math.PI * 2)) * SEGMENTS
    const s0 = Math.floor(fs) % SEGMENTS
    const s1 = (s0 + 1) % SEGMENTS
    const ts = fs - Math.floor(fs)
    const fk = RINGS * Math.pow((r - INNER) / (OUTER - INNER), 1 / 1.5)
    const k0 = Math.min(Math.floor(fk), RINGS - 1)
    const tk = fk - k0
    const h0 = lerp(heights[s0 * STRIDE + k0], heights[s0 * STRIDE + k0 + 1], tk)
    const h1 = lerp(heights[s1 * STRIDE + k0], heights[s1 * STRIDE + k0 + 1], tk)
    return lerp(h0, h1, ts)
  }

  const sunXZ = Math.hypot(SUN_DIRECTION.x, SUN_DIRECTION.z)
  const step = 18
  const dx = (SUN_DIRECTION.x / sunXZ) * step
  const dz = (SUN_DIRECTION.z / sunXZ) * step
  const dy = (SUN_DIRECTION.y / sunXZ) * step
  const sunVis = new Float32Array(SEGMENTS * STRIDE)
  for (let i = 0; i < SEGMENTS * STRIDE; i++) {
    let x = positions[i * 3]
    let y = positions[i * 3 + 1] + 0.5
    let z = positions[i * 3 + 2]
    let excess = -Infinity
    for (let n = 0; n < 40; n++) {
      x += dx
      y += dy
      z += dz
      const g = groundAt(x, z)
      if (g === -Infinity) break
      excess = Math.max(excess, g - y)
    }
    sunVis[i] = 1 - ss(-3, 6, excess)
  }

  const indices = new Uint16Array(SEGMENTS * RINGS * 6)
  let o = 0
  for (let s = 0; s < SEGMENTS; s++) {
    const s1 = (s + 1) % SEGMENTS
    for (let k = 0; k < RINGS; k++) {
      const a = s * STRIDE + k
      const b = s1 * STRIDE + k
      const c = a + 1
      const d = b + 1
      indices[o++] = a
      indices[o++] = b
      indices[o++] = c
      indices[o++] = b
      indices[o++] = d
      indices[o++] = c
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('echoSunVis', new THREE.BufferAttribute(sunVis, 1))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  const material = patchWorldMaterial(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }), {
    key: 'mountains',
    vertexPars: 'attribute float echoSunVis;\nvarying float vEchoSunVis;',
    vertex: 'vEchoSunVis = echoSunVis;',
    fragmentPars: 'varying float vEchoSunVis;',
    color: MOUNTAIN_COLOR,
    sunVisibility: 'vEchoSunVis',
  })
  material.name = 'echo.mountains'
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'mountains'
  mesh.matrixAutoUpdate = false
  return mesh
}
