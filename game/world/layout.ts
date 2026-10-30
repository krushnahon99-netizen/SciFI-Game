import { DEG } from '../core/math'

/**
 * Single source of truth for world coordinates (metres). +x = east, -z = north, +y = up.
 * Terrain shaping, structures, triggers and the spawn all read from here.
 *
 * Bands (south → north), each sealed from the next:
 *   1. Cradle basin (spawn, Sundered Monolith, Sleeping Giant)
 *      ── ridge wall; the Hall of Echoes fills its only pass ──
 *   2. Singing Vale (west), Ghost Garden terrace, Spire mesa + causeway (east)
 *      ── chasm across the whole map; the Glass Bridge crosses it ──
 *   3. Northern plateau: Conduit Works, Undervault pit, Drowned Bell crater
 * The Spire mesa sits on the ridge line and is only climbable by its causeway (band 2 side).
 */

export interface Point {
  readonly x: number
  readonly z: number
}

export interface Site extends Point {
  readonly radius: number
}

export interface Pad extends Site {
  /** Width of the blend back into the natural terrain. */
  readonly blend: number
  /** Fixed pad height; defaults to the natural height at the pad centre. */
  readonly height?: number
}

export const WORLD = {
  size: 720,
  half: 360,
  /** Heightmap cell size; physics and rendering sample the same grid. */
  cell: 2,
  playableRadius: 300,
  /** Outer cliffs start rising at edgeStart and are unclimbable well before edgeEnd. */
  edgeStart: 288,
  edgeEnd: 348,
} as const

export const SITES = {
  cradle: { x: 15, z: 215, radius: 70 },
  monolith: { x: -5, z: 172, radius: 16 },
  sleepingGiant: { x: -165, z: 222, radius: 18 },
  hall: { x: -70, z: 108, radius: 22 },
  vale: { x: -150, z: 15, radius: 85 },
  ghostGarden: { x: -248, z: 52, radius: 17 },
  spire: { x: 150, z: 62, radius: 30 },
  bridge: { x: -115, z: -62, radius: 26 },
  works: { x: 40, z: -165, radius: 40 },
  undervault: { x: 178, z: -150, radius: 20 },
  drownedBell: { x: -190, z: -190, radius: 26 },
  /** The chasm narrows here so a late-game bridge can shorten the walk back to the Spire. */
  returnCrossing: { x: 165, z: -27, radius: 12 },
} as const satisfies Record<string, Site>

/** Spectator/player start. Facing yaw 0.2 frames the Monolith against the sun with the planet to the right. */
export const SPAWN = { x: 22, z: 240, yaw: 0.2 } as const

/** Ridge wall between the Cradle basin and the Vale. Both halves end inside the Spire mesa. */
export const RIDGE_WEST: readonly Point[] = [
  { x: -380, z: 152 },
  { x: -215, z: 128 },
  { x: -70, z: 108 },
  { x: 30, z: 100 },
  { x: 112, z: 80 },
]
export const RIDGE_EAST: readonly Point[] = [
  { x: 188, z: 70 },
  { x: 262, z: 80 },
  { x: 380, z: 98 },
]

/** The chasm crosses the whole map (and the outer cliffs). Falling in always lands at CHASM_FLOOR. */
export const CHASM: readonly Point[] = [
  { x: -380, z: -46 },
  { x: -215, z: -72 },
  { x: -115, z: -62 },
  { x: -10, z: -40 },
  { x: 110, z: -24 },
  { x: 220, z: -30 },
  { x: 380, z: -10 },
]
export const CHASM_FLOOR = -72

export const MESA = { topRadius: 30, baseRadius: 42, height: 52 } as const

/** Raised causeway from the band-2 floor (start) to the mesa top (end); the Spire barrier stands at its foot. */
export const CAUSEWAY = {
  start: { x: 50, z: 4.5 },
  end: { x: 124, z: 47 },
  halfWidth: 4.5,
} as const

/** Sunken pit north-east of the Works; a carved ramp leads down to its floor. */
export const UNDERVAULT = {
  floor: -14,
  ramp: { start: { x: 128, z: -178 }, end: { x: 171, z: -153 }, halfWidth: 3.5 },
} as const

/** Ghost Garden terrace top (absolute height); its sheer sides are only reachable over phase stones. */
export const GHOST_TERRACE_HEIGHT = 4

export const PADS: readonly Pad[] = [
  { x: SPAWN.x, z: SPAWN.z, radius: 7, blend: 10 },
  { ...SITES.monolith, blend: 10 },
  { x: SITES.hall.x, z: SITES.hall.z, radius: 15, blend: 7, height: 4 },
  { ...SITES.works, blend: 14 },
]

export const SKY = {
  /** Towards the low amber sun (normalised in code). */
  sunDirection: { x: -0.45, y: 0.26, z: -0.85 },
  planet: {
    /** Same yaw convention as the camera: forward = (-sin yaw, 0, -cos yaw). */
    yaw: -0.12,
    elevation: 24 * DEG,
    angularRadius: 10.5 * DEG,
    ringInclination: 16 * DEG,
    ringRoll: -35 * DEG,
    /** Ring extent in planet radii. */
    ringInner: 1.35,
    ringOuter: 2.3,
  },
} as const
