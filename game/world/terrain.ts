import * as THREE from 'three'
import {
  BRIDGE,
  CHASM,
  CHUNK_CELLS,
  CRADLE,
  DROWNED_BELL,
  HALL,
  inUndervaultHole,
  PLANET_NOTCH,
  RIDGE,
  RIM,
  SPIRE,
  SUN_AZIMUTH,
  SUN_DIRECTION,
  TERRAIN_CELL,
  TERRAIN_HALF,
  TERRAIN_SAMPLES,
  TRAILS,
  UNDERVAULT,
  UNDERVAULT_HOLE,
  VALE,
  WORKS,
} from './layout'
import { fbm, lerp, noise, ridged, smoothstep as ss } from './noise'

export interface TerrainSample {
  height: number
  /** Splat weights in [0, 1]. */
  path: number
  vale: number
  ash: number
  sediment: number
}

/** 0 inside the low notch under the planet, 1 outside it. */
export function planetNotch(theta: number): number {
  let d = (theta - PLANET_NOTCH.azimuth) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  else if (d < -Math.PI) d += Math.PI * 2
  return ss(PLANET_NOTCH.inner, PLANET_NOTCH.outer, Math.abs(d))
}

/** Rim cliff-top height by azimuth: low toward the sun (so it doesn't shadow the valleys) and under the planet. */
export function rimHeight(theta: number): number {
  const h = RIM.low + (RIM.high - RIM.low) * ss(0.04, 0.42, 0.5 - 0.5 * Math.cos(theta - SUN_AZIMUTH))
  return lerp(Math.min(h, PLANET_NOTCH.rim), h, planetNotch(theta))
}

function rimRadius(theta: number): number {
  return RIM.radius + RIM.wobble * noise(2.3 * Math.cos(theta) + 11.1, 2.3 * Math.sin(theta) - 4.7)
}

const spireHill = (r: number): number =>
  SPIRE.height * ss(0.08, 0.92, (SPIRE.footRadius - r) / (SPIRE.footRadius - SPIRE.topRadius))

function flattenPad(h: number, x: number, z: number, px: number): number {
  const d = Math.hypot(x - px, z - BRIDGE.z)
  if (d >= BRIDGE.padRadius + 4) return h
  return lerp(h, BRIDGE.padHeight, 1 - ss(BRIDGE.padRadius, BRIDGE.padRadius + 4, d))
}

const scratch: TerrainSample = { height: 0, path: 0, vale: 0, ash: 0, sediment: 0 }

/** Analytic terrain: the single definition both the mesh and physics are baked from. */
export function sampleTerrain(x: number, z: number, out: TerrainSample = scratch): TerrainSample {
  let h = 3 + 5 * fbm(x / 150 + 3.1, z / 150 - 7.4, 4) + 1.3 * fbm(x / 34 - 2.6, z / 34 + 1.9, 3)

  // The Cradle: broad gentle bowl around the start.
  const dc = Math.hypot(x - CRADLE.x, z - CRADLE.z) / CRADLE.radius
  h = lerp(h, 1.2 + 0.35 * h, 1 - ss(0.5, 1.15, dc))

  // Singing Vale basin.
  const dv = Math.hypot(x - VALE.x, z - VALE.z) / VALE.radius
  const bowl = 1 - ss(0.15, 1, dv)
  h = h * (1 - 0.5 * bowl) - VALE.depth * bowl
  const vale = 1 - ss(0.55, 1.05, dv)

  // Conduit Works plateau: dead flat around the hub and the grid nodes so their plinths sit level.
  const dw = Math.hypot(x - WORKS.x, z - WORKS.z) / WORKS.radius
  h = lerp(h, WORKS.height + 0.25 * noise(x / 7, z / 7) * ss(0.55, 0.8, dw), 1 - ss(0.82, 1.2, dw))
  const ash = (1 - ss(0.7, 1.45, dw)) * (0.75 + 0.25 * noise(x / 11 + 9, z / 11))

  // Drowned Bell crater (bowl + raised lip).
  const db = Math.hypot(x - DROWNED_BELL.x, z - DROWNED_BELL.z) / DROWNED_BELL.radius
  if (db < 2) h += -DROWNED_BELL.depth * (1 - ss(0, 1, db * db)) + 1.4 * Math.exp(-((db - 1) * (db - 1)) / 0.05)
  let sediment = 1 - ss(0.45, 0.9, db)

  // Listening Spire: steep hill, spiral ramp shelf as the only way up.
  const sx = x - SPIRE.x
  const sz = z - SPIRE.z
  const rs = Math.hypot(sx, sz)
  if (rs < 90) {
    h = lerp(h, SPIRE.base, 1 - ss(40, 80, rs)) + spireHill(rs)
    const ramp = SPIRE.ramp
    let a = Math.atan2(sz, sx)
    if (a < 0) a += Math.PI * 2
    if (a < ramp.start) a += Math.PI * 2
    if (a <= ramp.end) {
      const s = (a - ramp.start) / (ramp.end - ramp.start)
      const rr = lerp(ramp.r0, ramp.r1, s)
      const w = (1 - ss(ramp.halfWidth, ramp.halfWidth + ramp.blend, Math.abs(rs - rr))) * ss(0, 0.03, s)
      if (w > 0) h = lerp(h, SPIRE.base + lerp(spireHill(ramp.r0), SPIRE.height, s), w)
    }
  }

  // East–west ridge, with the Hall of Echoes corridor carved through it.
  if (!RIDGE.line.outside(x, z, RIDGE.halfWidth + 4)) {
    const d = RIDGE.line.distance(x, z)
    const core = ss(1, 0.42, d / RIDGE.halfWidth)
    if (core > 0) {
      const crag = ridged(x / 38 + 4.4, z / 38 - 1.7, 4)
      const ridgeH = RIDGE.height * (0.82 + 0.3 * noise(RIDGE.line.along / 55, 3.7)) * core * (0.82 + 0.36 * crag)
      const corridor =
        (1 - ss(HALL.halfWidth, HALL.halfWidth + 4, Math.abs(x - HALL.x))) *
        (1 - ss(HALL.halfLength, HALL.halfLength + 6, Math.abs(z - HALL.z)))
      h += ridgeH * (1 - corridor)
      h = lerp(h, HALL.floor, corridor * core)
    }
  }

  // Outer rim cliffs.
  const r = Math.hypot(x, z)
  if (r > RIM.radius - RIM.wobble - 8) {
    const theta = Math.atan2(z, x)
    const cliff = ss(0.12, 0.88, (r - rimRadius(theta)) / RIM.cliffWidth)
    if (cliff > 0) {
      const top = rimHeight(theta) + 14 * ridged(x / 60 - 3.3, z / 60 + 8.1, 4)
      h = lerp(h, Math.max(h, top), cliff)
    }
  }

  // Glass Bridge landing pads.
  h = flattenPad(h, x, z, BRIDGE.x - BRIDGE.halfSpan)
  h = flattenPad(h, x, z, BRIDGE.x + BRIDGE.halfSpan)

  // The chasm.
  if (!CHASM.line.outside(x, z, CHASM.halfWidth + 6)) {
    const d = CHASM.line.distance(x, z)
    const along = CHASM.line.along
    const L = CHASM.line.length
    const ends = ss(0, 30, along) * (1 - ss(L - 45, L - 5, along))
    const hw = CHASM.halfWidth * (0.35 + 0.65 * ends)
    const walls = 1 - ss(hw - 3, hw + 1, d + 2.4 * noise(x / 9 + 2.2, z / 9 - 5.5))
    if (walls > 0) {
      const floor = lerp(h - 6, CHASM.floor + 4 * fbm(x / 20, z / 20, 3), ends)
      h = lerp(h, floor, walls)
      sediment = Math.max(sediment, walls * ends)
    }
  }

  // Trails: compacted, slightly sunken paths.
  let path = 0
  for (const trail of TRAILS) {
    if (trail.outside(x, z, 4)) continue
    const m = 1 - ss(1.2, 3.4, trail.distance(x, z))
    if (m > path) path = m
  }
  h -= 0.12 * path

  out.height = h
  out.path = path
  out.vale = vale
  out.ash = ash
  out.sediment = sediment
  return out
}

// ---------------------------------------------------------------- mesh

const N = TERRAIN_SAMPLES
const CHUNKS = (N - 1) / CHUNK_CELLS
const V = CHUNK_CELLS + 1
const PERIMETER = CHUNK_CELLS * 4
const LOD_STEPS = [1, 2, 4, 8]
const LOD_DISTANCES = [115, 230, 400]
const LOD_HYSTERESIS = 10

/** Chunk-local vertex index of perimeter position p: north edge east, east edge south, south edge west, west edge north. */
function perimeterVertex(p: number): number {
  const C = CHUNK_CELLS
  if (p < C) return p
  if (p < 2 * C) return (p - C) * V + C
  if (p < 3 * C) return C * V + (3 * C - p)
  return (4 * C - p) * V
}

function buildLodIndex(step: number): THREE.BufferAttribute {
  const cells = CHUNK_CELLS / step
  const indices = new Uint16Array(cells * cells * 6 + (PERIMETER / step) * 6)
  let o = 0
  for (let cj = 0; cj < cells; cj++) {
    for (let ci = 0; ci < cells; ci++) {
      const v00 = cj * step * V + ci * step
      const v10 = v00 + step
      const v01 = v00 + step * V
      const v11 = v01 + step
      indices[o++] = v00
      indices[o++] = v01
      indices[o++] = v10
      indices[o++] = v10
      indices[o++] = v01
      indices[o++] = v11
    }
  }
  for (let p = 0; p < PERIMETER; p += step) {
    const q = (p + step) % PERIMETER
    const t1 = perimeterVertex(p)
    const t2 = perimeterVertex(q)
    const s1 = V * V + p
    const s2 = V * V + q
    indices[o++] = t1
    indices[o++] = t2
    indices[o++] = s1
    indices[o++] = t2
    indices[o++] = s2
    indices[o++] = s1
  }
  return new THREE.BufferAttribute(indices, 1)
}

function dataTexture(data: Uint8Array | Uint16Array, format: THREE.PixelFormat, type: THREE.TextureDataType, name: string) {
  const texture = new THREE.DataTexture(data, N, N, format, type)
  texture.name = name
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

interface Chunk {
  geometry: THREE.BufferGeometry
  x: number
  z: number
  lod: number
}

/**
 * Heightmap terrain (361² samples, 2 m cells) rendered as 9×9 chunks with 4 LODs and skirts.
 * Also bakes the splat texture (path, vale, ash, sediment) and the terrain sun-shadow height texture.
 */
export class Terrain {
  readonly heights = new Float32Array(N * N)
  readonly root = new THREE.Group()
  readonly splatTexture: THREE.DataTexture
  readonly shadowTexture: THREE.DataTexture
  private readonly chunks: Chunk[] = []
  private readonly lodIndices: THREE.BufferAttribute[]
  private detail = 1

  constructor() {
    this.root.name = 'terrain'
    const splat = new Uint8Array(N * N * 4)
    const sample: TerrainSample = { height: 0, path: 0, vale: 0, ash: 0, sediment: 0 }
    for (let j = 0; j < N; j++) {
      const z = -TERRAIN_HALF + j * TERRAIN_CELL
      for (let i = 0; i < N; i++) {
        const k = j * N + i
        sampleTerrain(-TERRAIN_HALF + i * TERRAIN_CELL, z, sample)
        this.heights[k] = sample.height
        splat[k * 4] = Math.round(sample.path * 255)
        splat[k * 4 + 1] = Math.round(sample.vale * 255)
        splat[k * 4 + 2] = Math.round(sample.ash * 255)
        splat[k * 4 + 3] = Math.round(sample.sediment * 255)
      }
    }
    this.splatTexture = dataTexture(splat, THREE.RGBAFormat, THREE.UnsignedByteType, 'echo.terrainSplat')
    this.splatTexture.needsUpdate = true
    this.shadowTexture = this.bakeSunShadow()
    this.lodIndices = LOD_STEPS.map(buildLodIndex)
  }

  setDetail(detail: number) {
    this.detail = detail
  }

  /** `holeMaterial` goes on the chunk around the Undervault: it discards the terrain hole (layout `UNDERVAULT_HOLE`). */
  createMeshes(material: THREE.Material, holeMaterial = material) {
    const size = CHUNK_CELLS * TERRAIN_CELL
    const { reach } = UNDERVAULT_HOLE
    for (let cz = 0; cz < CHUNKS; cz++) {
      for (let cx = 0; cx < CHUNKS; cx++) {
        const geometry = this.buildChunkGeometry(cx, cz)
        geometry.setIndex(this.lodIndices[0])
        const x0 = -TERRAIN_HALF + cx * size
        const z0 = -TERRAIN_HALF + cz * size
        const hole =
          UNDERVAULT.x + reach > x0 &&
          UNDERVAULT.x - reach < x0 + size &&
          UNDERVAULT.z + reach > z0 &&
          UNDERVAULT.z - reach < z0 + size
        const mesh = new THREE.Mesh(geometry, hole ? holeMaterial : material)
        mesh.name = `terrain.${cx}.${cz}`
        mesh.receiveShadow = true
        mesh.castShadow = false
        mesh.matrixAutoUpdate = false
        this.root.add(mesh)
        const centre = -TERRAIN_HALF + (CHUNK_CELLS * TERRAIN_CELL) / 2
        this.chunks.push({
          geometry,
          x: centre + cx * CHUNK_CELLS * TERRAIN_CELL,
          z: centre + cz * CHUNK_CELLS * TERRAIN_CELL,
          lod: 0,
        })
      }
    }
  }

  /** Picks each chunk's LOD from its distance to the viewer (with hysteresis). */
  update(viewer: THREE.Vector3) {
    for (const chunk of this.chunks) {
      const d = Math.hypot(chunk.x - viewer.x, chunk.z - viewer.z)
      let lod = chunk.lod
      while (lod < LOD_DISTANCES.length && d > LOD_DISTANCES[lod] * this.detail + LOD_HYSTERESIS) lod++
      while (lod > 0 && d < LOD_DISTANCES[lod - 1] * this.detail - LOD_HYSTERESIS) lod--
      if (lod !== chunk.lod) {
        chunk.lod = lod
        chunk.geometry.setIndex(this.lodIndices[lod])
      }
    }
  }

  /** Ground height at (x, z), using the same triangle split as the full-detail mesh (low inside the Undervault hole). */
  heightAt(x: number, z: number): number {
    if (inUndervaultHole(x, z)) return UNDERVAULT_HOLE.ground
    const fx = Math.min(Math.max((x + TERRAIN_HALF) / TERRAIN_CELL, 0), N - 1.0001)
    const fz = Math.min(Math.max((z + TERRAIN_HALF) / TERRAIN_CELL, 0), N - 1.0001)
    const i = Math.floor(fx)
    const j = Math.floor(fz)
    const tx = fx - i
    const tz = fz - j
    const k = j * N + i
    const H = this.heights
    if (tx + tz < 1) return H[k] + (H[k + 1] - H[k]) * tx + (H[k + N] - H[k]) * tz
    const h11 = H[k + N + 1]
    return h11 + (H[k + N] - h11) * (1 - tx) + (H[k + 1] - h11) * (1 - tz)
  }

  dispose() {
    for (const chunk of this.chunks) chunk.geometry.dispose()
    this.chunks.length = 0
    this.splatTexture.dispose()
    this.shadowTexture.dispose()
  }

  /**
   * O(N) sweep toward the sun: O(i, j) is the height a point must exceed to see the sun.
   * The neighbour one column toward the (western) sun sits at row j + dj and `drop` metres lower along the ray.
   */
  private bakeSunShadow(): THREE.DataTexture {
    const H = this.heights
    const O = new Float32Array(N * N)
    const s = TERRAIN_CELL / -SUN_DIRECTION.x
    const dj = (SUN_DIRECTION.z * s) / TERRAIN_CELL
    const drop = SUN_DIRECTION.y * s
    for (let j = 0; j < N; j++) O[j * N] = -500
    for (let i = 1; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const jj = Math.min(Math.max(j + dj, 0), N - 1)
        const j0 = Math.floor(jj)
        const j1 = Math.min(j0 + 1, N - 1)
        const t = jj - j0
        const p0 = j0 * N + i - 1
        const p1 = j1 * N + i - 1
        const hPrev = H[p0] + (H[p1] - H[p0]) * t
        const oPrev = O[p0] + (O[p1] - O[p0]) * t
        O[j * N + i] = Math.max(hPrev, oPrev) - drop
      }
    }
    const half = new Uint16Array(N * N)
    for (let k = 0; k < N * N; k++) half[k] = THREE.DataUtils.toHalfFloat(O[k])
    const texture = dataTexture(half, THREE.RedFormat, THREE.HalfFloatType, 'echo.terrainShadow')
    // 361 × 2-byte rows are not 4-byte aligned.
    texture.unpackAlignment = 2
    texture.needsUpdate = true
    return texture
  }

  private buildChunkGeometry(cx: number, cz: number): THREE.BufferGeometry {
    const H = this.heights
    const count = V * V + PERIMETER
    const positions = new Float32Array(count * 3)
    const normals = new Float32Array(count * 3)
    const i0 = cx * CHUNK_CELLS
    const j0 = cz * CHUNK_CELLS
    for (let vj = 0; vj < V; vj++) {
      for (let vi = 0; vi < V; vi++) {
        const i = i0 + vi
        const j = j0 + vj
        const k = (vj * V + vi) * 3
        positions[k] = -TERRAIN_HALF + i * TERRAIN_CELL
        positions[k + 1] = H[j * N + i]
        positions[k + 2] = -TERRAIN_HALF + j * TERRAIN_CELL
        const nx = H[j * N + Math.max(i - 1, 0)] - H[j * N + Math.min(i + 1, N - 1)]
        const nz = H[Math.max(j - 1, 0) * N + i] - H[Math.min(j + 1, N - 1) * N + i]
        const ny = 2 * TERRAIN_CELL
        const inv = 1 / Math.hypot(nx, ny, nz)
        normals[k] = nx * inv
        normals[k + 1] = ny * inv
        normals[k + 2] = nz * inv
      }
    }

    // Skirt depth covers the worst crack between neighbouring LODs (coarsest step along the edges) + 1 m.
    const coarse = LOD_STEPS[LOD_STEPS.length - 1]
    let error = 0
    for (let p = 0; p < PERIMETER; p++) {
      const a = p - (p % coarse)
      const b = (a + coarse) % PERIMETER
      const t = (p % coarse) / coarse
      const ha = positions[perimeterVertex(a) * 3 + 1]
      const hb = positions[perimeterVertex(b) * 3 + 1]
      error = Math.max(error, Math.abs(positions[perimeterVertex(p) * 3 + 1] - (ha + (hb - ha) * t)))
    }
    const depth = error + 1
    for (let p = 0; p < PERIMETER; p++) {
      const src = perimeterVertex(p) * 3
      const dst = (V * V + p) * 3
      positions[dst] = positions[src]
      positions[dst + 1] = positions[src + 1] - depth
      positions[dst + 2] = positions[src + 2]
      normals[dst] = normals[src]
      normals[dst + 1] = normals[src + 1]
      normals[dst + 2] = normals[src + 2]
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.computeBoundingSphere()
    return geometry
  }
}
