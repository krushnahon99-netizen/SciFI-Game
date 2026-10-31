import { Vector3 } from 'three'
import type { RegionId } from '../gameplay/ids'

/**
 * ALL world coordinates live here (single source of truth).
 * Axes: x = east, z = south (north = −z), y = up. Units: metres.
 */

export type Point2 = readonly [number, number]

/** Polyline in the XZ plane with a cached segment table for fast distance queries. */
export class Polyline {
  readonly points: readonly Point2[]
  readonly length: number
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
  /** Arc length of the closest point found by the last `distance()` call. */
  along = 0
  private readonly ax: Float64Array
  private readonly az: Float64Array
  private readonly dx: Float64Array
  private readonly dz: Float64Array
  private readonly invLen2: Float64Array
  private readonly segLen: Float64Array
  private readonly start: Float64Array

  constructor(points: readonly Point2[]) {
    this.points = points
    const n = points.length - 1
    this.ax = new Float64Array(n)
    this.az = new Float64Array(n)
    this.dx = new Float64Array(n)
    this.dz = new Float64Array(n)
    this.invLen2 = new Float64Array(n)
    this.segLen = new Float64Array(n)
    this.start = new Float64Array(n)
    let total = 0
    for (let i = 0; i < n; i++) {
      const [x0, z0] = points[i]
      const [x1, z1] = points[i + 1]
      const dx = x1 - x0
      const dz = z1 - z0
      const len2 = dx * dx + dz * dz
      this.ax[i] = x0
      this.az[i] = z0
      this.dx[i] = dx
      this.dz[i] = dz
      this.invLen2[i] = len2 > 0 ? 1 / len2 : 0
      this.segLen[i] = Math.sqrt(len2)
      this.start[i] = total
      total += this.segLen[i]
    }
    this.length = total
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [x, z] of points) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    this.minX = minX
    this.maxX = maxX
    this.minZ = minZ
    this.maxZ = maxZ
  }

  /** True when (x, z) is farther than `margin` outside the bounding box (cheap early reject). */
  outside(x: number, z: number, margin: number): boolean {
    return x < this.minX - margin || x > this.maxX + margin || z < this.minZ - margin || z > this.maxZ + margin
  }

  /** Distance from (x, z) to the polyline. Also stores the arc length of the closest point in `along`. */
  distance(x: number, z: number): number {
    let best = Infinity
    let bestAlong = 0
    const n = this.ax.length
    for (let i = 0; i < n; i++) {
      const px = x - this.ax[i]
      const pz = z - this.az[i]
      let t = (px * this.dx[i] + pz * this.dz[i]) * this.invLen2[i]
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const ex = px - this.dx[i] * t
      const ez = pz - this.dz[i] * t
      const d2 = ex * ex + ez * ez
      if (d2 < best) {
        best = d2
        bestAlong = this.start[i] + t * this.segLen[i]
      }
    }
    this.along = bestAlong
    return Math.sqrt(best)
  }

  /** Point at arc length `s` (clamped to the ends). */
  pointAt(s: number, out: { x: number; z: number }): { x: number; z: number } {
    const n = this.ax.length
    let i = 0
    while (i < n - 1 && s > this.start[i] + this.segLen[i]) i++
    const t = this.segLen[i] > 0 ? Math.min(1, Math.max(0, (s - this.start[i]) / this.segLen[i])) : 0
    out.x = this.ax[i] + this.dx[i] * t
    out.z = this.az[i] + this.dz[i] * t
    return out
  }
}

// ---------------------------------------------------------------- terrain grid

export const TERRAIN_HALF = 360
export const TERRAIN_CELL = 2
/** Heightmap samples per side (360 cells × 2 m = 720 m). */
export const TERRAIN_SAMPLES = 361
export const CHUNK_CELLS = 40
/** Terrain-texture UV = xz / TERRAIN_UV_SCALE + 0.5 (texel centres sit on heightmap samples). */
export const TERRAIN_UV_SCALE = 722

// ---------------------------------------------------------------- sky

/** Low amber sun in the west (~17° up): side-light at spawn, shadows fall east. */
export const SUN_DIRECTION = new Vector3(-0.92, 0.3, -0.25).normalize()
export const SUN_AZIMUTH = Math.atan2(SUN_DIRECTION.z, SUN_DIRECTION.x)
/** Giant ringed planet, low in the NNE (~17° up). */
export const PLANET_DIRECTION = new Vector3(0.42, 0.29, -0.86).normalize()
/** sin(angular radius) of the planet disk. */
export const PLANET_RADIUS = 0.165
/**
 * Low gap in the rim and distant ranges under the planet (azimuth = atan2(z, x) from the origin, radians),
 * so the planet's lower limb stays visible from the Cradle, the Vale and the Works.
 */
export const PLANET_NOTCH = { azimuth: -1.25, inner: 0.25, outer: 0.7, rim: 38, mountainScale: 0.15 }

// ---------------------------------------------------------------- regions

export const SPAWN = { x: -4, z: 242, yaw: -0.12 }
export const CRADLE = { x: 0, z: 198, radius: 70 }
export const MONOLITH = { x: 8, z: 176 }

/** East–west ridge separating the Cradle from the north; only the Hall pass cuts through it. */
export const RIDGE = {
  line: new Polyline([
    [-370, 140], [-300, 124], [-230, 108], [-150, 98], [-70, 94], [10, 92],
    [90, 98], [170, 110], [250, 124], [310, 134], [370, 144],
  ]),
  halfWidth: 36,
  height: 34,
}

/** Hall of Echoes: N–S corridor through the ridge. */
export const HALL = { x: -70, z: 94, halfWidth: 9, halfLength: 42, floor: 2 }

/** Singing Vale: crystal basin. */
export const VALE = { x: -150, z: -32, radius: 100, depth: 10 }

/** The Choir: broken crystal pipes on a two-tier dais in the Vale floor, west of the trail junction. */
export const CHOIR = { x: -160, z: -44 }

export interface CrystalFormation {
  x: number
  z: number
  size: number
  count: number
  spread: number
}

/** Great crystal formations on the Vale slopes (all clear of the trails). */
export const VALE_FORMATIONS: readonly CrystalFormation[] = [
  { x: -200, z: -38, size: 4.2, count: 12, spread: 9 },
  { x: -182, z: -84, size: 3, count: 9, spread: 7 },
  { x: -140, z: -86, size: 2.6, count: 8, spread: 6 },
  { x: -112, z: -66, size: 3.2, count: 10, spread: 7 },
  { x: -150, z: 6, size: 2.4, count: 7, spread: 5.5 },
  { x: -188, z: 2, size: 2.8, count: 8, spread: 6 },
  { x: -118, z: -14, size: 1.8, count: 6, spread: 4 },
  { x: -232, z: -70, size: 5, count: 10, spread: 11 },
]

/** Crystal ribs arching over the trail where it drops into the Vale: feet, apex height above the higher foot. */
export const VALE_RIBS: readonly { a: Point2; b: Point2; height: number; radius: number }[] = [
  { a: [-96, 11.1], b: [-104, 25.5], height: 10, radius: 0.9 },
  { a: [-103.9, 1.7], b: [-113.1, 19.1], height: 13, radius: 1.1 },
  { a: [-111.7, -7.6], b: [-122.3, 12.6], height: 16, radius: 1.3 },
]

/** Chasm: tip buried in the ridge, south end cut into the outer rim. */
export const CHASM = {
  line: new Polyline([
    [28, 92], [22, 40], [30, -10], [22, -60], [36, -120], [28, -190], [42, -260], [40, -350],
  ]),
  halfWidth: 13,
  floor: -52,
}

/** Glass Bridge across the chasm; flat pads at x ± halfSpan. */
export const BRIDGE = { x: 26, z: -38, halfSpan: 18, padHeight: 4, padRadius: 5 }

/** Falling below this (deep in the chasm) respawns the player at the current region's spawn. */
export const FALL_LIMIT = CHASM.floor + 24

export const WORKS = { x: 150, z: -150, radius: 48, height: 9 }
export const UNDERVAULT = { x: 176, z: -178 }

/** Listening Spire hill; the spiral ramp is the only way up. Angles are atan2(z − cz, x − cx). */
export const SPIRE = {
  x: 200,
  z: 25,
  topRadius: 12,
  footRadius: 62,
  height: 42,
  base: 3,
  ramp: {
    start: (225 * Math.PI) / 180,
    end: (495 * Math.PI) / 180,
    r0: 51,
    r1: 13,
    halfWidth: 3.2,
    blend: 1.4,
  },
}

/** Secrets. */
export const DROWNED_BELL = { x: 100, z: 28, radius: 24, depth: 6.5 }
export const GHOST_GARDEN = { x: -150, z: 205 }
export const SLEEPING_GIANT = { x: -222, z: 22 }

/** Outer cliff rim: low toward the sun azimuth so it doesn't shadow the valleys. */
export const RIM = { radius: 300, wobble: 16, cliffWidth: 30, low: 24, high: 72 }

/** Walking trails (no trails to the secrets). */
export const TRAILS: readonly Polyline[] = [
  new Polyline([
    [-4, 242], [0, 222], [12, 198], [20, 180], [6, 160], [-30, 148], [-62, 140], [-70, 128],
    [-70, 94], [-70, 58], [-74, 44], [-96, 22], [-124, -4], [-140, -24],
  ]),
  new Polyline([[-140, -24], [-100, -40], [-56, -46], [-18, -42], [6, -38]]),
  new Polyline([[44, -38], [66, -58], [96, -92], [124, -124], [150, -150]]),
  new Polyline([[150, -150], [162, -110], [168, -60], [164, -14]]),
  new Polyline([[150, -150], [176, -178]]),
]

// ---------------------------------------------------------------- region volumes + spawn points (gameplay/regions.ts)

export type RegionShape =
  | { readonly kind: 'circle'; readonly x: number; readonly z: number; readonly radius: number }
  | { readonly kind: 'box'; readonly x: number; readonly z: number; readonly halfX: number; readonly halfZ: number }
  | { readonly kind: 'band'; readonly line: Polyline; readonly halfWidth: number }

export interface RegionArea {
  readonly id: RegionId
  readonly shape: RegionShape
}

/**
 * Discovery volumes in priority order: the first area containing the player wins, so nested areas come before
 * their surroundings (Undervault inside the Works). Gaps between areas keep the last region (see regions.ts).
 */
export const REGION_AREAS: readonly RegionArea[] = [
  { id: 'undervault', shape: { kind: 'circle', x: UNDERVAULT.x, z: UNDERVAULT.z, radius: 18 } },
  { id: 'hall', shape: { kind: 'box', x: HALL.x, z: HALL.z, halfX: HALL.halfWidth + 6, halfZ: HALL.halfLength } },
  // Only the stretch north of the ridge around the bridge: the chasm's tip is buried in the ridge above the Cradle.
  {
    id: 'chasm',
    shape: { kind: 'band', line: new Polyline(CHASM.line.points.slice(1, 5)), halfWidth: CHASM.halfWidth + 17 },
  },
  { id: 'works', shape: { kind: 'circle', x: WORKS.x, z: WORKS.z, radius: WORKS.radius + 6 } },
  { id: 'spire', shape: { kind: 'circle', x: SPIRE.x, z: SPIRE.z, radius: SPIRE.footRadius + 10 } },
  { id: 'vale', shape: { kind: 'circle', x: VALE.x, z: VALE.z, radius: VALE.radius } },
  { id: 'cradle', shape: { kind: 'circle', x: CRADLE.x, z: CRADLE.z, radius: CRADLE.radius + 20 } },
]

export interface SpawnPoint {
  readonly x: number
  readonly z: number
  /** Player/camera yaw: 0 faces north (−z), +π/2 faces west. */
  readonly yaw: number
}

/** Spawn at (x, z) looking toward (tx, tz). */
function spawnFacing(x: number, z: number, tx: number, tz: number): SpawnPoint {
  return { x, z, yaw: Math.atan2(x - tx, z - tz) }
}

/**
 * Respawn point per region (new game, load, falls): on the trail where the player arrives, inside the region's
 * volume. The Undervault one is provisional until M3b builds the chamber.
 */
export const REGION_SPAWNS: Readonly<Record<RegionId, SpawnPoint>> = {
  cradle: SPAWN,
  hall: spawnFacing(-69, 130, HALL.x, HALL.z),
  vale: spawnFacing(-84, 34, CHOIR.x, CHOIR.z),
  chasm: spawnFacing(0, -39, BRIDGE.x, BRIDGE.z),
  works: spawnFacing(118, -117, WORKS.x, WORKS.z),
  undervault: spawnFacing(168, -169.4, UNDERVAULT.x, UNDERVAULT.z),
  spire: spawnFacing(165.4, -30, SPIRE.x, SPIRE.z),
}
