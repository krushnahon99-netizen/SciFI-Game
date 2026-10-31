import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { GhostScene } from '../../echo/ghosts'
import { type PhasePart, PhaseObject } from '../../echo/phase'
import type { Collision } from '../../physics/collision'
import { Batch, block, mergeParts } from '../geometry'
import { BRIDGE, CHASM } from '../layout'
import { createEnergyMaterial, createStoneMaterial } from '../materials'
import { mulberry32 } from '../noise'
import type { StructureContext } from './context'

const GLOW = '#56e6ff'
/** Walkable height of both landings, their piers and the span's ends: one riser above the flattened pads. */
const DECK = BRIDGE.padHeight + 0.35
/** The span arches this far above DECK mid-chasm, in flat plank steps well under the 0.45 m step-up. */
const RISE = 0.8
const SPAN_WIDTH = 2.6
const PLANK_PITCH = 2.4
const FIN_HEIGHT = 0.75
/** How far each pier juts past the cliff edge, over the void. */
const OVERHANG = 2.6
const PIER_HALF_WIDTH = 1.75
/** The gate block straddles the rim: this far landward and seaward of it, and this much wider than the pier. */
const GATE = { halfLength: 1, extraHalfWidth: 1.15 }
const SLAB = 1.4
const LANDING_RADIUS = 4.6
const PYLON = { size: 1.1, height: 6.8, broken: 3.9 }

export interface GlassBridge {
  /** Phase planks, west to east. */
  readonly planks: readonly PhaseObject[]
  /** x of the west / east pier tips; the span between them runs along x at `BRIDGE.z`. */
  readonly west: number
  readonly east: number
  /** True once the span is locked in the present. */
  readonly stable: boolean
  /** Locks every plank in the present (puzzle solved, or loaded as solved). */
  stabilize(): void
}

interface Materials {
  stone: THREE.Material
  weathered: THREE.Material
  glyph: THREE.Material
}

interface LandingSpec {
  /** Where the cliff drops away on `BRIDGE.z`. */
  rim: number
  /** Pier tip x, where the span begins. */
  tip: number
  /** Direction from the rim toward the chasm. */
  dir: 1 | -1
  /** The west gate still stands (lintel and beacon); the east one has fallen. */
  intact: boolean
  seed: number
}

/** Dais centre for a landing: just landward of its gate block. */
const landingCentre = (rim: number, dir: 1 | -1) => rim - dir * (LANDING_RADIUS + GATE.halfLength - 0.4)

/** Glass Bridge chasm: carved landings and piers on both rims and a span of phase planks only a pulse makes solid. */
export function buildBridge(context: StructureContext): GlassBridge {
  const { scene, collision, reactives } = context
  const westRim = findRim(collision, BRIDGE.x - BRIDGE.halfSpan, 1)
  const eastRim = findRim(collision, BRIDGE.x + BRIDGE.halfSpan, -1)
  const west = westRim + OVERHANG
  const east = eastRim - OVERHANG
  const materials: Materials = {
    stone: createStoneMaterial('#877b73'),
    weathered: createStoneMaterial('#685d59'),
    glyph: createEnergyMaterial(GLOW, 1.6),
  }

  buildLanding(context, materials, { rim: westRim, tip: west, dir: 1, intact: true, seed: 17 })
  buildLanding(context, materials, { rim: eastRim, tip: east, dir: -1, intact: false, seed: 31 })
  buildDepthColumns(scene, materials, west, east)

  const deckAt = (x: number) => {
    const t = (x - west) / (east - west)
    return t <= 0 || t >= 1 ? DECK : DECK + RISE * Math.sin(Math.PI * t)
  }
  const planks = buildPlanks(scene, collision, west, east, deckAt)
  for (const plank of planks) reactives.add(plank)
  buildCrossingEcho(context, landingCentre(westRim, 1), landingCentre(eastRim, -1), west, east, deckAt)

  return {
    planks,
    west,
    east,
    get stable() {
      return planks.every((plank) => plank.isStable)
    },
    stabilize() {
      for (const plank of planks) plank.stabilize()
    },
  }
}

/** Where the cliff drops away walking from a pad centre toward the chasm; the most landward of three samples across the pier. */
function findRim(collision: Collision, pad: number, dir: 1 | -1): number {
  let rim = pad + dir * 14
  for (const dz of [-PIER_HALF_WIDTH, 0, PIER_HALF_WIDTH]) {
    for (let step = 0; step < 80; step++) {
      const x = pad + dir * step * 0.25
      if (collision.groundHeight(x, BRIDGE.z + dz) < BRIDGE.padHeight - 1.5) {
        rim = dir > 0 ? Math.min(rim, x) : Math.max(rim, x)
        break
      }
    }
  }
  return rim
}

/**
 * One rim: an octagonal dais, a gate block straddling the cliff edge with two pylons, and a pier jutting over the void
 * on a tapering buttress.
 */
function buildLanding({ scene, collision, reactives, animate }: StructureContext, m: Materials, spec: LandingSpec) {
  const { rim, tip, dir, intact } = spec
  const z0 = BRIDGE.z
  const centre = landingCentre(rim, dir)
  const random = mulberry32(spec.seed)
  const batch = new Batch()

  // Dais, one riser above the pad, reaching the gate block.
  let low = DECK
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    low = Math.min(low, collision.groundHeight(centre + Math.cos(angle) * 3.6, z0 + Math.sin(angle) * 3.6))
  }
  const footing = Math.max(low - 0.6, DECK - 6)
  batch.add(m.weathered, new THREE.CylinderGeometry(LANDING_RADIUS, LANDING_RADIUS + 0.3, DECK - footing, 8), centre, (DECK + footing) / 2, z0, {
    y: Math.PI / 8,
  })
  batch.add(m.glyph, new THREE.TorusGeometry(2.9, 0.05, 4, 8), centre, DECK, z0, { z: Math.PI / 8, x: Math.PI / 2 })
  collision.addCylinder(centre, z0, LANDING_RADIUS - 0.2, footing, DECK)

  // Gate block on the rim, then the pier: a tongue of stone with parapets on a buttress sunk into the chasm wall.
  const gateHalfWidth = PIER_HALF_WIDTH + GATE.extraHalfWidth
  batch.add(m.stone, block(GATE.halfLength * 2, SLAB, gateHalfWidth * 2), rim, DECK - SLAB, z0)
  collision.addBox(rim, z0, GATE.halfLength, gateHalfWidth, 0, DECK - SLAB, DECK)
  const back = rim - dir * GATE.halfLength
  const length = Math.abs(tip - back)
  const mid = (tip + back) / 2
  batch.add(m.stone, block(length, SLAB, PIER_HALF_WIDTH * 2), mid, DECK - SLAB, z0)
  batch.add(m.weathered, block(length / 0.8, 20, (PIER_HALF_WIDTH * 2 - 0.4) / 0.8, 0.8), mid - dir * 0.4, DECK - SLAB - 20, z0)
  collision.addBox(mid, z0, length / 2, PIER_HALF_WIDTH, 0, DECK - SLAB, DECK)
  for (const side of [-1, 1]) {
    const z = z0 + side * (PIER_HALF_WIDTH - 0.2)
    batch.add(m.stone, block(length, 0.8, 0.4), mid, DECK, z)
    batch.add(m.glyph, new THREE.BoxGeometry(length - 0.5, 0.04, 0.08), mid, DECK + 0.82, z)
    collision.addBox(mid, z, length / 2, 0.2, 0, DECK, DECK + 0.8)
  }
  // Inlaid diamonds lead to a lit threshold where the stone ends and the remembered span begins.
  for (let i = 0; i < Math.floor(length / 1.3); i++) {
    batch.add(m.glyph, new THREE.BoxGeometry(0.32, 0.04, 0.32), tip - dir * (0.8 + i * 1.3), DECK + 0.005, z0, { y: Math.PI / 4 })
  }
  batch.add(m.glyph, new THREE.BoxGeometry(0.14, 0.05, SPAN_WIDTH), tip - dir * 0.12, DECK + 0.01, z0)

  // The gate: two pylons on the gate block, glyphs on their inner faces.
  for (const side of [-1, 1]) {
    const z = z0 + side * (PIER_HALF_WIDTH + 0.55)
    const broken = !intact && side === 1
    const height = broken ? PYLON.broken : PYLON.height
    batch.add(m.stone, block(PYLON.size, height + SLAB, PYLON.size), rim, DECK - SLAB, z)
    if (!broken) batch.add(m.stone, block(PYLON.size + 0.3, 0.35, PYLON.size + 0.3), rim, DECK + height, z)
    batch.add(m.glyph, glyphStrip(random, height), rim, DECK, z - side * (PYLON.size / 2 + 0.015))
    collision.addBox(rim, z, PYLON.size / 2, PYLON.size / 2, 0, DECK - SLAB, DECK + height)
  }

  if (intact) {
    const top = DECK + PYLON.height + 0.35
    const spanZ = 2 * (PIER_HALF_WIDTH + 0.55) + PYLON.size + 0.3
    batch.add(m.stone, block(0.95, 0.75, spanZ), rim, top, z0)
    for (const face of [-1, 1]) {
      batch.add(m.glyph, new THREE.BoxGeometry(0.04, 0.08, spanZ - 1.6), rim + face * 0.49, top + 0.37, z0)
    }
    // A beacon still wakes above the west gate, marking where the span should be.
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), createEnergyMaterial(GLOW, 4))
    const beaconY = top + 1.7
    beacon.name = 'bridge.beacon'
    beacon.position.set(rim, beaconY, z0)
    beacon.scale.set(1, 1.6, 1)
    scene.add(beacon)
    animate((_dt, time) => {
      beacon.rotation.y = time * 0.7
      beacon.position.y = beaconY + Math.sin(time * 1.4) * 0.18
    })
  } else {
    // The east gate's snapped crown and its lintel lie across the dais, clear of the path.
    batch.add(m.stone, new THREE.BoxGeometry(2.6, PYLON.size, PYLON.size), centre - dir * 1.4, DECK + PYLON.size / 2, z0 - 3.2, { y: 0.35 })
    collision.addBox(centre - dir * 1.4, z0 - 3.2, 1.3, PYLON.size / 2, 0.35, DECK, DECK + PYLON.size)
    batch.add(m.stone, block(0.95, 0.75, 4.2), centre - dir * 0.6, DECK, z0 + 3.4, { y: -0.45 })
    collision.addBox(centre - dir * 0.6, z0 + 3.4, 0.475, 2.1, -0.45, DECK, DECK + 0.75)
  }

  batch.build(scene, intact ? 'bridge.westLanding' : 'bridge.eastLanding', m.glyph)
  reactives.add(
    new CrystalCluster(scene, collision, { x: centre - dir * 4.4, z: z0 + dir * 3.4, count: 5, spread: 1.5, seed: spec.seed + 3, size: 0.75 }),
  )
}

/** A broken vertical line of lit glyph segments up to `height`, in the XY plane (faces ±z). */
function glyphStrip(random: () => number, height: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  let y = 0.7
  while (y < height - 0.9) {
    const length = Math.min(0.35 + random() * 0.9, height - 0.7 - y)
    parts.push(new THREE.BoxGeometry(0.1, length, 0.04).translate(0, y + length / 2, 0))
    if (random() < 0.5) {
      parts.push(new THREE.BoxGeometry(0.34, 0.07, 0.04).translate((random() - 0.5) * 0.24, y + length * random(), 0))
    }
    y += length + 0.2 + random() * 0.35
  }
  return mergeParts(parts, 'bridge.glyphs')
}

/** Two broken columns rising out of the chasm under the span: all the stone the old crossing left behind. */
function buildDepthColumns(scene: THREE.Scene, m: Materials, west: number, east: number) {
  const batch = new Batch()
  const bottom = CHASM.floor - 8
  for (const [t, drop] of [
    [0.3, 9],
    [0.72, 14],
  ]) {
    const x = west + (east - west) * t
    const z = BRIDGE.z + 0.6
    const top = DECK - drop
    batch.add(m.weathered, new THREE.CylinderGeometry(1.45, 2.1, top - bottom, 9), x, (top + bottom) / 2, z)
    batch.add(m.weathered, new THREE.CylinderGeometry(1.2, 1.4, 1.3, 9), x + 0.3, top + 0.35, z - 0.2, { z: 0.32, x: 0.18 })
    batch.add(m.glyph, new THREE.TorusGeometry(1.52, 0.06, 4, 36), x, top - 1.6, z, { x: Math.PI / 2 })
  }
  batch.build(scene, 'bridge.depthColumns', m.glyph)
}

/** The span: planks with glass fins, each its own phase object so the wavefront reveals them one after another. */
function buildPlanks(
  scene: THREE.Scene,
  collision: Collision,
  west: number,
  east: number,
  deckAt: (x: number) => number,
): PhaseObject[] {
  const z0 = BRIDGE.z
  const count = Math.max(6, Math.round((east - west) / PLANK_PITCH))
  const pitch = (east - west) / count
  const plank = new THREE.BoxGeometry(pitch - 0.12, 0.26, SPAN_WIDTH)
  const fin = new THREE.BoxGeometry(pitch - 0.34, FIN_HEIGHT, 0.07)
  const planks: PhaseObject[] = []
  for (let i = 0; i < count; i++) {
    const x = west + (i + 0.5) * pitch
    const top = deckAt(x)
    // Colliders overlap their neighbours slightly so the walkable surface has no seams.
    const parts: PhasePart[] = [
      {
        geometry: plank,
        position: { x, y: top - 0.13, z: z0 },
        collider: { halfX: pitch / 2 + 0.03, halfZ: SPAN_WIDTH / 2, bottom: top - 0.4, top },
      },
    ]
    for (const side of [-1, 1]) {
      parts.push({
        geometry: fin,
        position: { x, y: top + FIN_HEIGHT / 2, z: z0 + side * (SPAN_WIDTH / 2 - 0.035) },
        collider: { halfX: (pitch - 0.34) / 2, halfZ: 0.06, bottom: top, top: top + FIN_HEIGHT },
      })
    }
    planks.push(new PhaseObject(scene, collision, parts, `bridge.plank${i}`))
  }
  return planks
}

/** Memory: the last pilgrims stepping out onto the span while the bridgekeeper calls them across. */
function buildCrossingEcho(
  { scene, collision, reactives }: StructureContext,
  westCentre: number,
  eastCentre: number,
  west: number,
  east: number,
  deckAt: (x: number) => number,
) {
  const z0 = BRIDGE.z
  const heightAt = (x: number, z: number) =>
    Math.abs(z - z0) < 3 && x > westCentre - LANDING_RADIUS && x < eastCentre + LANDING_RADIUS
      ? deckAt(x)
      : collision.groundHeight(x, z)
  reactives.add(
    new GhostScene(
      scene,
      [
        { path: [[west - 4, z0 - 0.45], [west + 14, z0 - 0.35]], speed: 1.5 },
        { path: [[west - 6.5, z0 + 0.15], [west + 8, z0 + 0.1]], speed: 1.2, delay: 1.2 },
        { path: [[west - 1.2, z0 + 1.15]], pose: 'reach', lookAt: [east, z0], scale: 1.06 },
      ],
      heightAt,
      'bridge.crossing',
    ),
  )
}
