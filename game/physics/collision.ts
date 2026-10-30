import * as THREE from 'three'

interface ColliderBase {
  x: number
  z: number
  minY: number
  maxY: number
  /** Disabled colliders are ignored by every query (phase objects toggle this). */
  enabled: boolean
  /** Query stamp, so a collider registered in several hash cells is visited once per query. */
  mark: number
}

/** Vertical cylinder. */
export interface CylinderCollider extends ColliderBase {
  kind: 'cylinder'
  radius: number
}

/** Box rotated around the y axis (`yaw` matches three's rotation.y). */
export interface BoxCollider extends ColliderBase {
  kind: 'box'
  halfX: number
  halfZ: number
  cos: number
  sin: number
}

export type Collider = CylinderCollider | BoxCollider

const CELL = 16
const HASH_OFFSET = 512
const cellKey = (ix: number, iz: number) => (ix + HASH_OFFSET) * 1024 + (iz + HASH_OFFSET)

/** Closest-feature result in the XZ plane: outward normal and signed distance (negative = inside). */
const probe = { nx: 0, nz: 0, distance: 0 }

function probeCollider(c: Collider, x: number, z: number) {
  const dx = x - c.x
  const dz = z - c.z
  if (c.kind === 'cylinder') {
    const d = Math.hypot(dx, dz)
    probe.nx = d > 1e-6 ? dx / d : 1
    probe.nz = d > 1e-6 ? dz / d : 0
    probe.distance = d - c.radius
    return probe
  }
  // Into box space (inverse of a yaw rotation).
  const lx = dx * c.cos - dz * c.sin
  const lz = dx * c.sin + dz * c.cos
  const qx = Math.max(-c.halfX, Math.min(c.halfX, lx))
  const qz = Math.max(-c.halfZ, Math.min(c.halfZ, lz))
  const ex = lx - qx
  const ez = lz - qz
  const outside = Math.hypot(ex, ez)
  let nlx: number
  let nlz: number
  if (outside > 1e-6) {
    nlx = ex / outside
    nlz = ez / outside
    probe.distance = outside
  } else {
    const px = c.halfX - Math.abs(lx)
    const pz = c.halfZ - Math.abs(lz)
    if (px < pz) {
      nlx = Math.sign(lx) || 1
      nlz = 0
      probe.distance = -px
    } else {
      nlx = 0
      nlz = Math.sign(lz) || 1
      probe.distance = -pz
    }
  }
  // Back to world space.
  probe.nx = nlx * c.cos + nlz * c.sin
  probe.nz = -nlx * c.sin + nlz * c.cos
  return probe
}

/**
 * Static world collision: heightmap ground plus cylinder/box colliders in a spatial hash.
 * Collider tops are walkable (step-up), sides push the character out.
 */
export class Collision {
  private readonly cells = new Map<number, Collider[]>()
  private readonly found: Collider[] = []
  private stamp = 0

  constructor(private readonly ground: (x: number, z: number) => number) {}

  groundHeight(x: number, z: number): number {
    return this.ground(x, z)
  }

  /** Unit terrain normal by central differences (1 m apart). */
  groundNormal(x: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const hx = this.ground(x + 1, z) - this.ground(x - 1, z)
    const hz = this.ground(x, z + 1) - this.ground(x, z - 1)
    return out.set(-hx, 2, -hz).normalize()
  }

  addCylinder(x: number, z: number, radius: number, minY: number, maxY: number): CylinderCollider {
    const collider: CylinderCollider = { kind: 'cylinder', x, z, radius, minY, maxY, enabled: true, mark: 0 }
    this.insert(collider, radius)
    return collider
  }

  addBox(x: number, z: number, halfX: number, halfZ: number, yaw: number, minY: number, maxY: number): BoxCollider {
    const collider: BoxCollider = {
      kind: 'box',
      x,
      z,
      halfX,
      halfZ,
      cos: Math.cos(yaw),
      sin: Math.sin(yaw),
      minY,
      maxY,
      enabled: true,
      mark: 0,
    }
    this.insert(collider, Math.hypot(halfX, halfZ))
    return collider
  }

  remove(collider: Collider) {
    for (const list of this.cells.values()) {
      const index = list.indexOf(collider)
      if (index >= 0) list.splice(index, 1)
    }
  }

  /**
   * Pushes a character cylinder (feet at `position.y`) out of collider sides.
   * Returns the highest collider top it can stand on (within `stepUp` of the feet), or -Infinity.
   */
  resolveCharacter(position: THREE.Vector3, radius: number, height: number, stepUp: number): number {
    let support = -Infinity
    const nearby = this.gather(position.x, position.z, radius + 1)
    for (let pass = 0; pass < 2; pass++) {
      for (const c of nearby) {
        if (position.y + height < c.minY || position.y > c.maxY + 0.05) continue
        const hit = probeCollider(c, position.x, position.z)
        const depth = radius - hit.distance
        if (depth <= 0) continue
        if (position.y >= c.maxY - stepUp) {
          if (hit.distance < 0) {
            support = Math.max(support, c.maxY)
            continue
          }
          if (position.y >= c.maxY - 0.05) continue
        }
        position.x += hit.nx * depth
        position.z += hit.nz * depth
      }
    }
    return support
  }

  /** Fraction (0…1) of the segment from → to that a sphere of `margin` can travel before hitting terrain or colliders. */
  clearance(from: THREE.Vector3, to: THREE.Vector3, margin: number): number {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const length = Math.hypot(dx, dy, dz)
    if (length < 1e-4) return 1
    const nearby = this.gather(from.x + dx / 2, from.z + dz / 2, length / 2 + margin + 1)
    const steps = Math.max(2, Math.ceil(length / 0.25))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = from.x + dx * t
      const y = from.y + dy * t
      const z = from.z + dz * t
      if (y < this.ground(x, z) + margin || this.blocked(nearby, x, y, z, margin)) return (i - 1) / steps
    }
    return 1
  }

  private blocked(nearby: readonly Collider[], x: number, y: number, z: number, margin: number): boolean {
    for (const c of nearby) {
      if (y < c.minY - margin || y > c.maxY + margin) continue
      if (probeCollider(c, x, z).distance < margin) return true
    }
    return false
  }

  private insert(collider: Collider, reach: number) {
    const x0 = Math.floor((collider.x - reach) / CELL)
    const x1 = Math.floor((collider.x + reach) / CELL)
    const z0 = Math.floor((collider.z - reach) / CELL)
    const z1 = Math.floor((collider.z + reach) / CELL)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = cellKey(ix, iz)
        let list = this.cells.get(key)
        if (!list) {
          list = []
          this.cells.set(key, list)
        }
        list.push(collider)
      }
    }
  }

  /** Unique colliders in the hash cells overlapping the square of half-size `reach` around (x, z). */
  private gather(x: number, z: number, reach: number): Collider[] {
    const found = this.found
    found.length = 0
    const stamp = ++this.stamp
    const x0 = Math.floor((x - reach) / CELL)
    const x1 = Math.floor((x + reach) / CELL)
    const z0 = Math.floor((z - reach) / CELL)
    const z1 = Math.floor((z + reach) / CELL)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.cells.get(cellKey(ix, iz))
        if (!list) continue
        for (const c of list) {
          if (c.mark === stamp || !c.enabled) continue
          c.mark = stamp
          found.push(c)
        }
      }
    }
    return found
  }
}
