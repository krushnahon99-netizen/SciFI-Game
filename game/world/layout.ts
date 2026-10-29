/**
 * Single source of truth for world coordinates and region shapes.
 *
 * Axes: +x = east, -z = north, +y = up. Units are meters.
 * Route (south → north): Cradle → Hall of Echoes (ridge pass) → Singing Vale → Glass Bridge
 * (chasm) → Conduit Works → Undervault → Listening Spire.
 *
 * Gating relies on terrain that is too steep to climb (see heightfield.ts):
 *  - an east–west ridge whose only pass is filled by the Hall of Echoes (gate blocks the exit)
 *  - an east–west chasm crossed only by the Glass Bridge
 *  - the Undervault is roofed and reachable only through the Works' sealed door
 *  - the Spire plateau is reachable only by the causeway, capped by an energy barrier
 */

export const WORLD = {
  size: 720,
  half: 360,
  cell: 2,
  res: 361,
  playRadius: 300,
  killY: -22,
} as const

function norm3(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z)
  return [x / l, y / l, z / l]
}

/** Low, dying sun in the north-west; long raking light across the dunes. */
export const SUN_DIR = norm3(-0.55, 0.19, -0.81)
/** Giant ringed planet hanging in the north-east sky. */
export const PLANET_DIR = norm3(0.56, 0.42, -0.72)

export const SPAWN = { x: 4, z: 266, yaw: 0 } as const

export const CRADLE = { x: 0, z: 228, r: 64 } as const
export const MONOLITH = { x: 0, z: 210, daisR: 15 } as const

export const RIDGE = { z: 142, crestHalf: 8, halfWidth: 21, height: 34 } as const
export const PASS = { x: -42, floorHalf: 10, edge: 12.5 } as const
export const HALL = { x: -42, z: 142, halfW: 11, halfL: 19 } as const

export const VALE = { x: -55, z: 45, r: 78, depth: 7 } as const
export const GARDEN = { x: -178, z: 62, r: 22, height: 4 } as const
export const CRATER = { x: 150, z: 35, r: 32, depth: 8 } as const
export const GIANT = { x: 150, z: 195, r: 16 } as const

export const CHASM = { z: -60, halfWidth: 12, edge: 2.5, floor: -46 } as const
export const BRIDGE = {
  x: 12,
  zSouth: -44.5,
  zNorth: -75.5,
  halfW: 2.2,
  padR: 9,
  southPad: { x: 12, z: -39 },
  northPad: { x: 12, z: -81 },
} as const

export const WORKS = { x: 100, z: -164, hx: 48, hz: 70, corner: 16, blend: 14 } as const

/** Sunken chamber below the Works. Heights are relative to the Works floor (see FLAT.works). */
export const VAULT = {
  x: 110,
  doorZ: -186,
  corridorHalfW: 4,
  corridorZ0: -187,
  corridorZ1: -205,
  chamberZ: -219,
  chamberHX: 13,
  chamberHZ: 14,
  floorDepth: 9,
  ceilingDepth: 1,
} as const

export const GRID_NODES = [
  { x: 58, z: -120 },
  { x: 142, z: -128 },
  { x: 100, z: -172 },
] as const

export const SPIRE = { x: -95, z: -248, topR: 24, top: 36, barrierR: 21 } as const

const cwDir = (() => {
  const dx = -30 - SPIRE.x
  const dz = -160 - SPIRE.z
  const l = Math.hypot(dx, dz)
  return { x: dx / l, z: dz / l }
})()

export const CAUSEWAY = {
  ax: -30,
  az: -160,
  bx: SPIRE.x + cwDir.x * SPIRE.topR,
  bz: SPIRE.z + cwDir.z * SPIRE.topR,
  dirX: cwDir.x,
  dirZ: cwDir.z,
  halfW: 3.2,
} as const

export const CLIFFS = { start: 282, end: 325, height: 80 } as const

export type RegionId =
  | 'cradle'
  | 'hall'
  | 'vale'
  | 'garden'
  | 'crater'
  | 'giant'
  | 'bridge'
  | 'works'
  | 'vault'
  | 'spire'

export interface RegionDef {
  id: RegionId
  name: string
  subtitle: string
  x: number
  z: number
  r: number
}

/** Discovery zones (circles) used for region banners and the journal. */
export const REGIONS: RegionDef[] = [
  { id: 'cradle', name: 'The Cradle', subtitle: 'Where the Sundered Monolith waits', x: CRADLE.x, z: CRADLE.z, r: 70 },
  { id: 'hall', name: 'Hall of Echoes', subtitle: 'A temple carved into the ridge', x: HALL.x, z: HALL.z, r: 26 },
  { id: 'vale', name: 'The Singing Vale', subtitle: 'Crystals that remember a song', x: VALE.x, z: VALE.z, r: 75 },
  { id: 'garden', name: 'Ghost Garden', subtitle: 'Petals that bloomed a thousand years ago', x: GARDEN.x, z: GARDEN.z, r: 26 },
  { id: 'crater', name: 'The Drowned Bell', subtitle: 'A lake that is no longer there', x: CRATER.x, z: CRATER.z, r: 34 },
  { id: 'giant', name: 'The Sleeping Giant', subtitle: 'It still faces the sky', x: GIANT.x, z: GIANT.z, r: 26 },
  { id: 'bridge', name: 'The Glass Bridge', subtitle: 'Only memory holds it up', x: BRIDGE.x, z: CHASM.z, r: 26 },
  { id: 'works', name: 'Conduit Works', subtitle: 'The machines are only sleeping', x: WORKS.x, z: WORKS.z, r: 70 },
  { id: 'vault', name: 'The Undervault', subtitle: 'Sealed beneath the Works', x: VAULT.x, z: VAULT.chamberZ, r: 16 },
  { id: 'spire', name: 'The Listening Spire', subtitle: 'Where the world will hear you', x: SPIRE.x, z: SPIRE.z, r: 40 },
]

/** Keep-out circles for large scatter (structures, paths, puzzle spaces). */
export const SCATTER_EXCLUSIONS: { x: number; z: number; r: number }[] = [
  { x: SPAWN.x, z: SPAWN.z, r: 8 },
  { x: MONOLITH.x, z: MONOLITH.z, r: 24 },
  { x: HALL.x, z: HALL.z + 24, r: 14 },
  { x: HALL.x, z: HALL.z - 26, r: 14 },
  { x: BRIDGE.southPad.x, z: BRIDGE.southPad.z, r: 12 },
  { x: BRIDGE.northPad.x, z: BRIDGE.northPad.z, r: 12 },
  { x: GARDEN.x, z: GARDEN.z, r: 20 },
  { x: CRATER.x, z: CRATER.z, r: 14 },
  { x: GIANT.x, z: GIANT.z, r: 14 },
  { x: SPIRE.x, z: SPIRE.z, r: 40 },
  { x: CAUSEWAY.ax, z: CAUSEWAY.az, r: 10 },
]
