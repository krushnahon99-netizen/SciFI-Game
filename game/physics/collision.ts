/**
 * Static collision world: yaw-rotated boxes and vertical cylinders in a spatial hash, plus the
 * terrain heightfield. Resolves a vertical capsule (feet position) and answers raycasts for the
 * camera. Pure math — no three.js.
 */
import type { HeightField } from '../world/heightfield'

export type Surface = 'sand' | 'stone' | 'metal' | 'glass'

interface ColliderBase {
  id: string
  enabled: boolean
  surface: Surface
  /** Excluded from camera raycasts (thin props, glass). */
  noCamera?: boolean
  /** Spatial-hash bookkeeping. */
  _cells?: number[]
}

export interface BoxCollider extends ColliderBase {
  kind: 'box'
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
  /** three.js-style yaw (rotation.y). */
  yaw: number
  cos: number
  sin: number
}

export interface CylCollider extends ColliderBase {
  kind: 'cyl'
  cx: number
  cz: number
  r: number
  y0: number
  y1: number
}

export type Collider = BoxCollider | CylCollider

export interface BoxSpec {
  id?: string
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  yaw?: number
  surface?: Surface
  noCamera?: boolean
  enabled?: boolean
}

export interface CapsuleState {
  grounded: boolean
  groundY: number
  normalY: number
  surface: Surface
  onCollider: boolean
}

const CELL = 16
const keyOf = (ix: number, iz: number) => (ix + 512) * 1024 + (iz + 512)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

let autoId = 0

export class CollisionWorld {
  private grid = new Map<number, Collider[]>()
  private scratch: Collider[] = []
  private stamp = new Map<Collider, number>()
  private queryId = 0
  readonly colliders = new Set<Collider>()

  constructor(readonly terrain: HeightField) {}

  addBox(s: BoxSpec): BoxCollider {
    const yaw = s.yaw ?? 0
    const c: BoxCollider = {
      kind: 'box',
      id: s.id ?? `box${autoId++}`,
      enabled: s.enabled ?? true,
      surface: s.surface ?? 'stone',
      noCamera: s.noCamera,
      cx: s.x,
      cy: s.y,
      cz: s.z,
      hx: s.hx,
      hy: s.hy,
      hz: s.hz,
      yaw,
      cos: Math.cos(yaw),
      sin: Math.sin(yaw),
    }
    this.insert(c)
    return c
  }

  addCylinder(s: { id?: string; x: number; z: number; r: number; y0: number; y1: number; surface?: Surface; noCamera?: boolean }): CylCollider {
    const c: CylCollider = {
      kind: 'cyl',
      id: s.id ?? `cyl${autoId++}`,
      enabled: true,
      surface: s.surface ?? 'stone',
      noCamera: s.noCamera,
      cx: s.x,
      cz: s.z,
      r: s.r,
      y0: s.y0,
      y1: s.y1,
    }
    this.insert(c)
    return c
  }

  /** Re-hash after moving a collider. */
  update(c: Collider) {
    this.removeFromGrid(c)
    if (c.kind === 'box') {
      c.cos = Math.cos(c.yaw)
      c.sin = Math.sin(c.yaw)
    }
    this.insertIntoGrid(c)
  }

  remove(c: Collider) {
    this.removeFromGrid(c)
    this.colliders.delete(c)
  }

  private insert(c: Collider) {
    this.colliders.add(c)
    this.insertIntoGrid(c)
  }

  private extent(c: Collider): [number, number, number, number] {
    if (c.kind === 'cyl') return [c.cx - c.r, c.cz - c.r, c.cx + c.r, c.cz + c.r]
    const ex = Math.abs(c.hx * c.cos) + Math.abs(c.hz * c.sin)
    const ez = Math.abs(c.hx * c.sin) + Math.abs(c.hz * c.cos)
    return [c.cx - ex, c.cz - ez, c.cx + ex, c.cz + ez]
  }

  private insertIntoGrid(c: Collider) {
    const [x0, z0, x1, z1] = this.extent(c)
    const cells: number[] = []
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const k = keyOf(ix, iz)
        let list = this.grid.get(k)
        if (!list) {
          list = []
          this.grid.set(k, list)
        }
        list.push(c)
        cells.push(k)
      }
    }
    c._cells = cells
  }

  private removeFromGrid(c: Collider) {
    for (const k of c._cells ?? []) {
      const list = this.grid.get(k)
      if (!list) continue
      const i = list.indexOf(c)
      if (i >= 0) list.splice(i, 1)
    }
    c._cells = []
  }

  query(x0: number, z0: number, x1: number, z1: number): Collider[] {
    const out = this.scratch
    out.length = 0
    const q = ++this.queryId
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const list = this.grid.get(keyOf(ix, iz))
        if (!list) continue
        for (const c of list) {
          if (!c.enabled || this.stamp.get(c) === q) continue
          this.stamp.set(c, q)
          out.push(c)
        }
      }
    }
    return out
  }

  /**
   * Pushes a vertical capsule (feet at p, radius r, total height h) out of colliders.
   * Small ledges up to `step` are climbed when grounded. Mutates p and velocity v.
   */
  resolveCapsule(
    p: { x: number; y: number; z: number },
    v: { x: number; y: number; z: number },
    r: number,
    h: number,
    step: number,
    wasGrounded: boolean,
    state: CapsuleState,
  ) {
    const list = this.query(p.x - r - 1, p.z - r - 1, p.x + r + 1, p.z + r + 1)
    for (let iter = 0; iter < 3; iter++) {
      let any = false
      for (const c of list) {
        const n = c.kind === 'box' ? this.pushBox(c, p, r, h, step, wasGrounded) : this.pushCyl(c, p, r, h, step, wasGrounded)
        if (!n) continue
        any = true
        const vn = v.x * n[0] + v.y * n[1] + v.z * n[2]
        if (vn < 0) {
          v.x -= vn * n[0]
          v.y -= vn * n[1]
          v.z -= vn * n[2]
        }
        if (n[1] > 0.65) {
          state.grounded = true
          state.onCollider = true
          state.normalY = n[1]
          state.groundY = p.y
          state.surface = c.surface
        }
      }
      if (!any) break
    }
  }

  private pushNormal: [number, number, number] = [0, 0, 0]

  private pushBox(b: BoxCollider, p: { x: number; y: number; z: number }, r: number, h: number, step: number, grounded: boolean) {
    const dx = p.x - b.cx
    const dz = p.z - b.cz
    const lx = dx * b.cos - dz * b.sin
    const lz = dx * b.sin + dz * b.cos
    const y0 = p.y + r
    const y1 = p.y + h - r
    const minY = b.cy - b.hy
    const maxY = b.cy + b.hy
    const qx = clamp(lx, -b.hx, b.hx)
    const qz = clamp(lz, -b.hz, b.hz)
    const ex = lx - qx
    const ez = lz - qz
    const ey = y1 < minY ? y1 - minY : y0 > maxY ? y0 - maxY : 0
    const d2 = ex * ex + ey * ey + ez * ez
    if (d2 >= r * r) return null

    const top = maxY - p.y
    if (grounded && top > 0 && top <= step && ey === 0) {
      p.y = maxY
      this.pushNormal[0] = 0
      this.pushNormal[1] = 1
      this.pushNormal[2] = 0
      return this.pushNormal
    }

    let nx: number
    let ny: number
    let nz: number
    let depth: number
    const d = Math.sqrt(d2)
    if (d > 1e-5) {
      nx = ex / d
      ny = ey / d
      nz = ez / d
      depth = r - d
    } else {
      const up = maxY - y0 + r
      const down = y1 - minY + r
      const px = b.hx - lx + r
      const mx = lx + b.hx + r
      const pz = b.hz - lz + r
      const mz = lz + b.hz + r
      depth = Math.min(up, down, px, mx, pz, mz)
      nx = depth === px ? 1 : depth === mx ? -1 : 0
      nz = nx === 0 ? (depth === pz ? 1 : depth === mz ? -1 : 0) : 0
      ny = nx === 0 && nz === 0 ? (depth === up ? 1 : -1) : 0
    }
    const wx = nx * b.cos + nz * b.sin
    const wz = -nx * b.sin + nz * b.cos
    p.x += wx * depth
    p.y += ny * depth
    p.z += wz * depth
    this.pushNormal[0] = wx
    this.pushNormal[1] = ny
    this.pushNormal[2] = wz
    return this.pushNormal
  }

  private pushCyl(c: CylCollider, p: { x: number; y: number; z: number }, r: number, h: number, step: number, grounded: boolean) {
    const dx = p.x - c.cx
    const dz = p.z - c.cz
    const dh = Math.hypot(dx, dz)
    const y0 = p.y + r
    const y1 = p.y + h - r
    const outside = Math.max(0, dh - c.r)
    const ex = dh > 1e-6 ? (dx / dh) * outside : 0
    const ez = dh > 1e-6 ? (dz / dh) * outside : 0
    const ey = y1 < c.y0 ? y1 - c.y0 : y0 > c.y1 ? y0 - c.y1 : 0
    const d2 = ex * ex + ey * ey + ez * ez
    if (d2 >= r * r) return null

    const top = c.y1 - p.y
    if (grounded && top > 0 && top <= step && ey === 0) {
      p.y = c.y1
      this.pushNormal[0] = 0
      this.pushNormal[1] = 1
      this.pushNormal[2] = 0
      return this.pushNormal
    }

    const d = Math.sqrt(d2)
    let nx: number
    let ny: number
    let nz: number
    let depth: number
    if (d > 1e-5) {
      nx = ex / d
      ny = ey / d
      nz = ez / d
      depth = r - d
    } else {
      const radial = c.r - dh + r
      const up = c.y1 - y0 + r
      const down = y1 - c.y0 + r
      depth = Math.min(radial, up, down)
      if (depth === radial) {
        nx = dh > 1e-6 ? dx / dh : 1
        nz = dh > 1e-6 ? dz / dh : 0
        ny = 0
      } else {
        nx = 0
        nz = 0
        ny = depth === up ? 1 : -1
      }
    }
    p.x += nx * depth
    p.y += ny * depth
    p.z += nz * depth
    this.pushNormal[0] = nx
    this.pushNormal[1] = ny
    this.pushNormal[2] = nz
    return this.pushNormal
  }

  /** Nearest hit distance along a normalized ray against terrain + colliders (or maxDist). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    let best = maxDist
    // Terrain: march then refine.
    const stepLen = 0.35
    let prevT = 0
    let prevDiff = oy - this.terrain.heightAt(ox, oz)
    if (prevDiff < 0) return 0
    for (let t = stepLen; t <= maxDist; t += stepLen) {
      const x = ox + dx * t
      const y = oy + dy * t
      const z = oz + dz * t
      const diff = y - this.terrain.heightAt(x, z)
      if (diff < 0) {
        best = prevT + (t - prevT) * (prevDiff / (prevDiff - diff))
        break
      }
      prevT = t
      prevDiff = diff
    }
    const ex = ox + dx * best
    const ez = oz + dz * best
    const list = this.query(Math.min(ox, ex) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oz, ez) + 1)
    for (const c of list) {
      if (c.noCamera) continue
      const t = c.kind === 'box' ? rayBox(c, ox, oy, oz, dx, dy, dz) : rayCyl(c, ox, oy, oz, dx, dy, dz)
      if (t >= 0 && t < best) best = t
    }
    return best
  }

  /** Point inside any enabled collider (used for placement sanity checks). */
  pointInside(x: number, y: number, z: number): Collider | null {
    for (const c of this.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1)) {
      if (c.kind === 'box') {
        const dx = x - c.cx
        const dz = z - c.cz
        const lx = dx * c.cos - dz * c.sin
        const lz = dx * c.sin + dz * c.cos
        if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz && Math.abs(y - c.cy) <= c.hy) return c
      } else if (Math.hypot(x - c.cx, z - c.cz) <= c.r && y >= c.y0 && y <= c.y1) return c
    }
    return null
  }
}

function rayBox(b: BoxCollider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const rx = ox - b.cx
  const rz = oz - b.cz
  const lox = rx * b.cos - rz * b.sin
  const loz = rx * b.sin + rz * b.cos
  const ldx = dx * b.cos - dz * b.sin
  const ldz = dx * b.sin + dz * b.cos
  const loy = oy - b.cy
  let tmin = -Infinity
  let tmax = Infinity
  const axes: [number, number, number][] = [
    [lox, ldx, b.hx],
    [loy, dy, b.hy],
    [loz, ldz, b.hz],
  ]
  for (const [o, d, hh] of axes) {
    if (Math.abs(d) < 1e-8) {
      if (o < -hh || o > hh) return -1
      continue
    }
    let t1 = (-hh - o) / d
    let t2 = (hh - o) / d
    if (t1 > t2) [t1, t2] = [t2, t1]
    if (t1 > tmin) tmin = t1
    if (t2 < tmax) tmax = t2
    if (tmin > tmax) return -1
  }
  if (tmax < 0) return -1
  return tmin >= 0 ? tmin : 0
}

function rayCyl(c: CylCollider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  const px = ox - c.cx
  const pz = oz - c.cz
  const a = dx * dx + dz * dz
  const b = 2 * (px * dx + pz * dz)
  const cc = px * px + pz * pz - c.r * c.r
  if (cc <= 0 && oy >= c.y0 && oy <= c.y1) return 0
  if (a < 1e-8) return -1
  const disc = b * b - 4 * a * cc
  if (disc < 0) return -1
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  if (t < 0) return -1
  const y = oy + dy * t
  return y >= c.y0 && y <= c.y1 ? t : -1
}
