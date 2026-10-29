/**
 * Chunked terrain mesh with three discrete LODs per chunk and skirts that hide LOD cracks.
 * LOD0 matches HeightField triangulation exactly, so what you see is what you stand on.
 */
import * as THREE from 'three'
import { HeightField, regionWeights } from './heightfield'
import { fbm2, smoothstep } from './noise'

const CHUNK_CELLS = 45
const LOD_STEPS = [1, 3, 5]
const SKIRT_DEPTH = [2, 6, 12]

const C = (hex: string) => new THREE.Color(hex)
const PALETTE = {
  sand: C('#a2836a'),
  cradle: C('#ad8a6c'),
  north: C('#8a7d72'),
  vale: C('#77637f'),
  garden: C('#8f917d'),
  crater: C('#4d4341'),
  works: C('#5f5a55'),
  spire: C('#a59a8e'),
  cliff: C('#5d535b'),
  deep: C('#2a2730'),
}

function computeColors(hf: HeightField): Float32Array {
  const { res, cell, origin } = hf
  const out = new Float32Array(res * res * 3)
  const c = new THREE.Color()
  for (let j = 0; j < res; j++) {
    const z = origin + j * cell
    for (let i = 0; i < res; i++) {
      const x = origin + i * cell
      const w = regionWeights(x, z)
      c.copy(PALETTE.sand)
      c.lerp(PALETTE.cradle, w.cradle * 0.6)
      c.lerp(PALETTE.north, w.north * 0.8)
      c.lerp(PALETTE.vale, w.vale * 0.85)
      c.lerp(PALETTE.garden, w.garden * 0.8)
      c.lerp(PALETTE.crater, w.crater * 0.85)
      c.lerp(PALETTE.works, w.works * 0.7)
      c.lerp(PALETTE.spire, w.spire * 0.6)
      c.lerp(PALETTE.cliff, w.cliff * 0.7)
      const h = hf.data[j * res + i]
      if (h < -6) c.lerp(PALETTE.deep, smoothstep(-6, -30, h))
      const v = 0.9 + 0.2 * (fbm2(x * 0.02, z * 0.02, 3) * 0.5 + 0.5)
      const k = (j * res + i) * 3
      out[k] = c.r * v
      out[k + 1] = c.g * v
      out[k + 2] = c.b * v
    }
  }
  return out
}

/** Index buffer shared by all chunks of one LOD (grid + double-sided skirts). */
function buildIndex(seg: number): THREE.BufferAttribute {
  const n = seg + 1
  const idx: number[] = []
  for (let b = 0; b < seg; b++) {
    for (let a = 0; a < seg; a++) {
      const A = b * n + a
      const B = A + 1
      const Cc = A + n
      const D = Cc + 1
      idx.push(A, Cc, B, Cc, D, B)
    }
  }
  const base = n * n
  // Edge vertex order: north (b=0), south (b=seg), west (a=0), east (a=seg).
  const edges: number[][] = [[], [], [], []]
  for (let k = 0; k < n; k++) {
    edges[0].push(k)
    edges[1].push(seg * n + k)
    edges[2].push(k * n)
    edges[3].push(k * n + seg)
  }
  edges.forEach((edge, e) => {
    for (let k = 0; k < seg; k++) {
      const t0 = edge[k]
      const t1 = edge[k + 1]
      const s0 = base + e * n + k
      const s1 = s0 + 1
      idx.push(t0, s0, t1, t1, s0, s1, t0, t1, s0, t1, s1, s0)
    }
  })
  const arr = n * n + 4 * n > 65535 ? new Uint32Array(idx) : new Uint16Array(idx)
  return new THREE.BufferAttribute(arr, 1)
}

interface Chunk {
  meshes: THREE.Mesh[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minY: number
  maxY: number
  level: number
}

export class Terrain {
  readonly group = new THREE.Group()
  private chunks: Chunk[] = []

  constructor(hf: HeightField, material: THREE.Material) {
    this.group.name = 'terrain'
    const colors = computeColors(hf)
    const { res, cell, origin } = hf
    const perSide = (res - 1) / CHUNK_CELLS
    const indices = LOD_STEPS.map((s) => buildIndex(CHUNK_CELLS / s))
    const nrm: [number, number, number] = [0, 1, 0]

    for (let cj = 0; cj < perSide; cj++) {
      for (let ci = 0; ci < perSide; ci++) {
        const gi0 = ci * CHUNK_CELLS
        const gj0 = cj * CHUNK_CELLS
        const cx = origin + (gi0 + CHUNK_CELLS / 2) * cell
        const cz = origin + (gj0 + CHUNK_CELLS / 2) * cell
        let minY = Infinity
        let maxY = -Infinity
        const meshes: THREE.Mesh[] = []

        LOD_STEPS.forEach((step, level) => {
          const seg = CHUNK_CELLS / step
          const n = seg + 1
          const count = n * n + 4 * n
          const pos = new Float32Array(count * 3)
          const nor = new Float32Array(count * 3)
          const col = new Float32Array(count * 3)
          const write = (v: number, gi: number, gj: number, yOffset: number) => {
            const y = hf.at(gi, gj)
            if (level === 0 && yOffset === 0) {
              if (y < minY) minY = y
              if (y > maxY) maxY = y
            }
            pos[v * 3] = origin + gi * cell - cx
            pos[v * 3 + 1] = y - yOffset
            pos[v * 3 + 2] = origin + gj * cell - cz
            hf.gridNormal(gi, gj, nrm)
            nor[v * 3] = nrm[0]
            nor[v * 3 + 1] = nrm[1]
            nor[v * 3 + 2] = nrm[2]
            const k = (gj * res + gi) * 3
            const dim = yOffset > 0 ? 0.6 : 1
            col[v * 3] = colors[k] * dim
            col[v * 3 + 1] = colors[k + 1] * dim
            col[v * 3 + 2] = colors[k + 2] * dim
          }
          for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) write(b * n + a, gi0 + a * step, gj0 + b * step, 0)
          const skirt = SKIRT_DEPTH[level]
          const base = n * n
          for (let k = 0; k < n; k++) {
            write(base + k, gi0 + k * step, gj0, skirt)
            write(base + n + k, gi0 + k * step, gj0 + seg * step, skirt)
            write(base + 2 * n + k, gi0, gj0 + k * step, skirt)
            write(base + 3 * n + k, gi0 + seg * step, gj0 + k * step, skirt)
          }
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
          geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
          geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
          geo.setIndex(indices[level])
          geo.computeBoundingSphere()
          geo.computeBoundingBox()
          const mesh = new THREE.Mesh(geo, material)
          mesh.position.set(cx, 0, cz)
          mesh.receiveShadow = true
          mesh.castShadow = false
          mesh.visible = level === 0
          mesh.matrixAutoUpdate = false
          mesh.updateMatrix()
          this.group.add(mesh)
          meshes.push(mesh)
        })

        const half = (CHUNK_CELLS * cell) / 2
        this.chunks.push({
          meshes,
          minX: cx - half,
          maxX: cx + half,
          minZ: cz - half,
          maxZ: cz + half,
          minY,
          maxY,
          level: 0,
        })
      }
    }
  }

  update(cam: THREE.Vector3, lodScale: number) {
    const d0 = 75 * lodScale
    const d1 = 190 * lodScale
    for (const c of this.chunks) {
      const dx = Math.max(c.minX - cam.x, 0, cam.x - c.maxX)
      const dz = Math.max(c.minZ - cam.z, 0, cam.z - c.maxZ)
      const dy = Math.max(c.minY - cam.y, 0, cam.y - c.maxY)
      const d = Math.hypot(dx, dy, dz)
      const level = d < d0 ? 0 : d < d1 ? 1 : 2
      if (level !== c.level) {
        c.meshes[c.level].visible = false
        c.meshes[level].visible = true
        c.level = level
      }
    }
  }

  setCastShadow(on: boolean) {
    for (const c of this.chunks) for (const m of c.meshes) m.castShadow = on
  }

  dispose() {
    for (const c of this.chunks) for (const m of c.meshes) m.geometry.dispose()
  }
}
