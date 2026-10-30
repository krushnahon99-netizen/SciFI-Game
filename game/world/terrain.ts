import * as THREE from 'three'
import { clamp, lerp, smoothstep } from '../core/math'
import type { QualitySettings } from '../render/quality'
import {
  CAUSEWAY,
  CHASM,
  CHASM_FLOOR,
  GHOST_TERRACE_HEIGHT,
  MESA,
  PADS,
  RIDGE_EAST,
  RIDGE_WEST,
  SITES,
  UNDERVAULT,
  WORLD,
  type Point,
} from './layout'
import { fbm2, ridged2, valueNoise2 } from './noise'

// ---------------------------------------------------------------------------------------------
// Analytic height field. Sampled once into the heightmap; never called per frame.
// ---------------------------------------------------------------------------------------------

function distanceToPolyline(x: number, z: number, line: readonly Point[]): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i]
    const b = line[i + 1]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1)
    const dx = x - (a.x + abx * t)
    const dz = z - (a.z + abz * t)
    best = Math.min(best, dx * dx + dz * dz)
  }
  return Math.sqrt(best)
}

const frame = { t: 0, d: 0 }

/** Writes the unclamped position along a→b (`t`: 0 at a, 1 at b) and the perpendicular distance (`d`). */
function segmentFrame(x: number, z: number, a: Point, b: Point) {
  const abx = b.x - a.x
  const abz = b.z - a.z
  const t = ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)
  frame.t = t
  frame.d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t))
}

function baseHeight(x: number, z: number): number {
  let h = fbm2(x * 0.0055, z * 0.0055, 5, 1) * 8
  h += (ridged2(x * 0.011, z * 0.011, 4, 7) - 0.3) * 7
  h += fbm2(x * 0.045, z * 0.045, 3, 13) * 0.7
  h += smoothstep(-25, -95, z) * 8
  const vale = Math.hypot(x - SITES.vale.x, z - SITES.vale.z)
  h -= 9 * (1 - smoothstep(SITES.vale.radius * 0.35, SITES.vale.radius * 1.1, vale))
  return h
}

const padTargets = PADS.map((pad) => ({ ...pad, target: pad.height ?? baseHeight(pad.x, pad.z) }))
const causewayFoot = baseHeight(CAUSEWAY.start.x, CAUSEWAY.start.z)
const rampTop = baseHeight(UNDERVAULT.ramp.start.x, UNDERVAULT.ramp.start.z)

/** Final ground height at (x, z), in metres. Feature order matters (see layout.ts for the map). */
export function terrainHeight(x: number, z: number): number {
  let h = baseHeight(x, z)

  for (const pad of padTargets) {
    const d = Math.hypot(x - pad.x, z - pad.z)
    if (d < pad.radius + pad.blend) h = lerp(pad.target, h, smoothstep(pad.radius, pad.radius + pad.blend, d))
  }

  const ridgeDistance = Math.min(distanceToPolyline(x, z, RIDGE_WEST), distanceToPolyline(x, z, RIDGE_EAST))
  if (ridgeDistance < 20) {
    const crest = 22 + ridged2(x * 0.02, z * 0.02, 3, 41) * 14
    const pass = smoothstep(10, 22, Math.hypot(x - SITES.hall.x, z - SITES.hall.z))
    h = Math.max(h, crest * (1 - smoothstep(5, 17, ridgeDistance)) * pass)
  }

  const mesaDistance = Math.hypot(x - SITES.spire.x, z - SITES.spire.z)
  if (mesaDistance < MESA.baseRadius + 10) {
    const edge = mesaDistance + fbm2(x * 0.06, z * 0.06, 2, 53) * 3
    const top = MESA.height + valueNoise2(x * 0.08, z * 0.08, 51) * 1.2
    h = Math.max(h, top * (1 - smoothstep(MESA.topRadius, MESA.baseRadius, edge)))
  }

  segmentFrame(x, z, CAUSEWAY.start, CAUSEWAY.end)
  if (frame.t > -0.15 && frame.t < 1.05 && frame.d < CAUSEWAY.halfWidth + 8) {
    const deck = lerp(causewayFoot, MESA.height, Math.min(frame.t, 1))
    h = Math.max(h, deck - smoothstep(CAUSEWAY.halfWidth, CAUSEWAY.halfWidth + 5, frame.d) * 70)
  }

  const garden = SITES.ghostGarden
  const gardenDistance = Math.hypot(x - garden.x, z - garden.z)
  if (gardenDistance < garden.radius + 6) {
    h = Math.max(h, GHOST_TERRACE_HEIGHT - smoothstep(garden.radius, garden.radius + 4, gardenDistance) * 30)
  }

  const bell = SITES.drownedBell
  const bellDistance = Math.hypot(x - bell.x, z - bell.z)
  if (bellDistance < bell.radius * 2) {
    const rim = 6 * Math.exp(-(((bellDistance - bell.radius) / 6) ** 2))
    const bowl = bellDistance < bell.radius ? -16 * (1 - (bellDistance / bell.radius) ** 2) : 0
    h += rim + bowl
  }

  const vault = SITES.undervault
  const vaultDistance = Math.hypot(x - vault.x, z - vault.z)
  if (vaultDistance < vault.radius + 4) {
    h = Math.min(h, lerp(UNDERVAULT.floor, h, smoothstep(vault.radius - 6, vault.radius + 2, vaultDistance)))
  }

  const ramp = UNDERVAULT.ramp
  segmentFrame(x, z, ramp.start, ramp.end)
  if (frame.t > -0.25 && frame.t < 1.2 && frame.d < ramp.halfWidth + 4) {
    const floor = lerp(rampTop, UNDERVAULT.floor, clamp(frame.t, 0, 1))
    const weight =
      (1 - smoothstep(ramp.halfWidth, ramp.halfWidth + 3, frame.d)) *
      smoothstep(-0.25, 0, frame.t) *
      (1 - smoothstep(1, 1.15, frame.t))
    h = lerp(h, Math.min(h, floor), weight)
  }

  const radius = Math.hypot(x, z)
  if (radius > WORLD.edgeStart - 30) {
    const angle = Math.atan2(z, x)
    const wobble = fbm2(Math.cos(angle) * 2.2, Math.sin(angle) * 2.2, 3, 61) * 16
    const e = smoothstep(WORLD.edgeStart + wobble, WORLD.edgeEnd + wobble, radius)
    h += e * e * (72 + ridged2(x * 0.012, z * 0.012, 4, 67) * 60)
  }

  const chasmDistance = distanceToPolyline(x, z, CHASM)
  if (chasmDistance < 24) {
    const crossing = SITES.returnCrossing
    const narrow = 0.45 + 0.55 * smoothstep(8, 40, Math.hypot(x - crossing.x, z - crossing.z))
    const halfWidth = (12 + (valueNoise2(x * 0.035, z * 0.035, 71) - 0.5) * 6) * narrow
    h = Math.min(h, lerp(CHASM_FLOOR, h, smoothstep(halfWidth - 5, halfWidth + 1, chasmDistance)))
  }

  return h
}

// ---------------------------------------------------------------------------------------------
// Heightmap + chunked LOD meshes
// ---------------------------------------------------------------------------------------------

const CHUNK_CELLS = 36
/** Vertex stride per LOD; each divides CHUNK_CELLS. */
const LOD_STEPS = [1, 2, 4, 6] as const
/** Distance (m, × quality.terrainDetail) below which LOD i is used. */
const LOD_DISTANCES = [85, 175, 310] as const
const LOD_HYSTERESIS = 10

interface Chunk {
  readonly mesh: THREE.Mesh
  readonly ix0: number
  readonly iz0: number
  readonly minX: number
  readonly minZ: number
  readonly maxX: number
  readonly maxZ: number
  readonly geometries: (THREE.BufferGeometry | undefined)[]
  lod: number
}

/**
 * Owns the heightmap (shared with physics) and its render chunks. Each chunk swaps between cached LOD
 * geometries; skirts hide the cracks between neighbours at different LODs.
 */
export class Terrain {
  readonly group = new THREE.Group()
  /** Row-major (z, then x) ground heights on the WORLD.cell grid. */
  readonly heights: Float32Array
  /** Samples per side. */
  readonly samples: number

  private readonly chunks: Chunk[] = []
  private readonly indices: (THREE.BufferAttribute | undefined)[] = []
  private lodScale = 1

  constructor(material: THREE.Material, quality: QualitySettings) {
    this.group.name = 'terrain'
    const cells = WORLD.size / WORLD.cell
    this.samples = cells + 1
    this.heights = new Float32Array(this.samples * this.samples)
    for (let iz = 0; iz < this.samples; iz++) {
      const z = -WORLD.half + iz * WORLD.cell
      const row = iz * this.samples
      for (let ix = 0; ix < this.samples; ix++) {
        this.heights[row + ix] = terrainHeight(-WORLD.half + ix * WORLD.cell, z)
      }
    }

    const perSide = cells / CHUNK_CELLS
    const chunkSize = CHUNK_CELLS * WORLD.cell
    const coarsest = LOD_STEPS.length - 1
    for (let cz = 0; cz < perSide; cz++) {
      for (let cx = 0; cx < perSide; cx++) {
        const ix0 = cx * CHUNK_CELLS
        const iz0 = cz * CHUNK_CELLS
        const geometries: (THREE.BufferGeometry | undefined)[] = []
        geometries[coarsest] = this.buildGeometry(ix0, iz0, coarsest)
        const mesh = new THREE.Mesh(geometries[coarsest], material)
        mesh.castShadow = true
        mesh.receiveShadow = true
        mesh.matrixAutoUpdate = false
        const minX = -WORLD.half + cx * chunkSize
        const minZ = -WORLD.half + cz * chunkSize
        this.chunks.push({
          mesh,
          ix0,
          iz0,
          minX,
          minZ,
          maxX: minX + chunkSize,
          maxZ: minZ + chunkSize,
          geometries,
          lod: coarsest,
        })
        this.group.add(mesh)
      }
    }
    this.applyQuality(quality)
  }

  applyQuality(quality: QualitySettings) {
    this.lodScale = quality.terrainDetail
  }

  /** Picks each chunk's LOD from its distance to the viewer (camera). */
  update(viewer: THREE.Vector3) {
    for (const chunk of this.chunks) {
      const dx = Math.max(chunk.minX - viewer.x, 0, viewer.x - chunk.maxX)
      const dz = Math.max(chunk.minZ - viewer.z, 0, viewer.z - chunk.maxZ)
      const distance = Math.hypot(dx, dz)
      let lod = LOD_STEPS.length - 1
      for (let i = 0; i < LOD_DISTANCES.length; i++) {
        if (distance < LOD_DISTANCES[i] * this.lodScale + (i >= chunk.lod ? LOD_HYSTERESIS : 0)) {
          lod = i
          break
        }
      }
      if (lod !== chunk.lod) {
        chunk.lod = lod
        chunk.mesh.geometry = chunk.geometries[lod] ??= this.buildGeometry(chunk.ix0, chunk.iz0, lod)
      }
    }
  }

  /** Ground height using the exact triangle split of the LOD0 mesh, so feet and mesh always agree. */
  heightAt(x: number, z: number): number {
    const n = this.samples
    const gx = clamp((x + WORLD.half) / WORLD.cell, 0, n - 1.0001)
    const gz = clamp((z + WORLD.half) / WORLD.cell, 0, n - 1.0001)
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const fx = gx - ix
    const fz = gz - iz
    const i = iz * n + ix
    const h = this.heights
    if (fx + fz <= 1) return h[i] + (h[i + 1] - h[i]) * fx + (h[i + n] - h[i]) * fz
    const hd = h[i + n + 1]
    return hd + (h[i + n] - hd) * (1 - fx) + (h[i + 1] - hd) * (1 - fz)
  }

  /** Surface normal of the triangle under (x, z); `normal.y` is the cosine of the slope angle. */
  normalAt(x: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    const n = this.samples
    const gx = clamp((x + WORLD.half) / WORLD.cell, 0, n - 1.0001)
    const gz = clamp((z + WORLD.half) / WORLD.cell, 0, n - 1.0001)
    const ix = Math.floor(gx)
    const iz = Math.floor(gz)
    const i = iz * n + ix
    const h = this.heights
    const upper = gx - ix + (gz - iz) <= 1
    const dx = upper ? h[i + 1] - h[i] : h[i + n + 1] - h[i + n]
    const dz = upper ? h[i + n] - h[i] : h[i + n + 1] - h[i + 1]
    return target.set(-dx, WORLD.cell, -dz).normalize()
  }

  dispose() {
    for (const chunk of this.chunks) {
      for (const geometry of chunk.geometries) geometry?.dispose()
    }
    this.chunks.length = 0
  }

  private buildGeometry(ix0: number, iz0: number, lod: number): THREE.BufferGeometry {
    const step = LOD_STEPS[lod]
    const m = CHUNK_CELLS / step + 1
    const skirtDepth = 2 + step * 1.5
    const vertexCount = m * m + 4 * m
    const positions = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    let v = 0
    const write = (ix: number, iz: number, drop: number) => {
      const o = v * 3
      positions[o] = -WORLD.half + ix * WORLD.cell
      positions[o + 1] = this.heights[iz * this.samples + ix] - drop
      positions[o + 2] = -WORLD.half + iz * WORLD.cell
      this.writeNormal(ix, iz, normals, o)
      v++
    }
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) write(ix0 + i * step, iz0 + j * step, 0)
    const last = (m - 1) * step
    for (let i = 0; i < m; i++) write(ix0 + i * step, iz0, skirtDepth)
    for (let i = 0; i < m; i++) write(ix0 + i * step, iz0 + last, skirtDepth)
    for (let j = 0; j < m; j++) write(ix0, iz0 + j * step, skirtDepth)
    for (let j = 0; j < m; j++) write(ix0 + last, iz0 + j * step, skirtDepth)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setIndex(this.indexFor(lod))
    geometry.computeBoundingSphere()
    return geometry
  }

  /** Central-difference normal on the full-resolution grid (identical across LODs, so lighting never pops). */
  private writeNormal(ix: number, iz: number, out: Float32Array, offset: number) {
    const n = this.samples
    const h = this.heights
    const row = iz * n
    const nx = h[row + Math.max(ix - 1, 0)] - h[row + Math.min(ix + 1, n - 1)]
    const nz = h[Math.max(iz - 1, 0) * n + ix] - h[Math.min(iz + 1, n - 1) * n + ix]
    const ny = 2 * WORLD.cell
    const length = Math.hypot(nx, ny, nz)
    out[offset] = nx / length
    out[offset + 1] = ny / length
    out[offset + 2] = nz / length
  }

  /** Index buffer shared by every chunk at this LOD: grid triangles + four outward-facing skirt strips. */
  private indexFor(lod: number): THREE.BufferAttribute {
    const cached = this.indices[lod]
    if (cached) return cached
    const m = CHUNK_CELLS / LOD_STEPS[lod] + 1
    const cells = m - 1
    const data = new Uint16Array((cells * cells + 4 * cells) * 6)
    let k = 0
    const tri = (a: number, b: number, c: number) => {
      data[k++] = a
      data[k++] = b
      data[k++] = c
    }
    // Diagonal runs from (i+1, j) to (i, j+1); heightAt() uses the same split.
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = j * m + i
        const c = a + m
        tri(a, c, a + 1)
        tri(a + 1, c, c + 1)
      }
    }
    const north = m * m
    const south = north + m
    const west = south + m
    const east = west + m
    for (let i = 0; i < cells; i++) {
      let t0 = i
      tri(t0, t0 + 1, north + i)
      tri(t0 + 1, north + i + 1, north + i)
      t0 = (m - 1) * m + i
      tri(t0, south + i, t0 + 1)
      tri(t0 + 1, south + i, south + i + 1)
      t0 = i * m
      tri(t0, west + i, t0 + m)
      tri(t0 + m, west + i, west + i + 1)
      t0 = i * m + m - 1
      tri(t0, t0 + m, east + i)
      tri(t0 + m, east + i + 1, east + i)
    }
    const attribute = new THREE.BufferAttribute(data, 1)
    this.indices[lod] = attribute
    return attribute
  }
}
