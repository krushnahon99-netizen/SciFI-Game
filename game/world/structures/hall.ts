import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { PastStateOverlay } from '../../echo/pastState'
import type { BoxCollider, Collision } from '../../physics/collision'
import { block, mergeParts } from '../geometry'
import { HALL } from '../layout'
import { createEnergyMaterial, createStoneMaterial } from '../materials'
import { mulberry32 } from '../noise'
import type { Animator, StructureContext } from './context'

/**
 * Plan along the corridor (north = −z). The portal and the gate sit where the ridge walls are already ~70 % and
 * ~95 % of full height, so neither can be walked around.
 */
const PLAN = {
  portalZ: HALL.z + 24,
  gateZ: HALL.z - 18,
  /** Colonnade rows, south to north; the sanctum dais sits between the third and fourth. */
  rows: [HALL.z + 18.5, HALL.z + 13, HALL.z + 7.5, HALL.z - 7.5, HALL.z - 13],
  columnX: 6.2,
  columnHeight: 7.6,
  daisRadius: 7,
  pillarRadius: 5.2,
}

/** Present-day column heights per row (west, east); 0 = only the plinth survives. */
const RUIN: readonly (readonly [number, number])[] = [
  [PLAN.columnHeight, PLAN.columnHeight],
  [PLAN.columnHeight, 3.1],
  [1.7, 0],
  [0, 2.6],
  [4.4, PLAN.columnHeight],
]

const GATE = { leafWidth: 4.6, leafHeight: 9.6, leafDepth: 1.1, openSeconds: 4.5 }

export interface HallPillar {
  /** Centre of the pillar's base (world). */
  position: THREE.Vector3
  /** This pillar's own glyph material; raise `emissiveIntensity` to light it. */
  glyph: THREE.MeshStandardMaterial
}

export interface Hall {
  /** Centre of the altar top (world), where the Choir Sequence is started with a pulse. */
  altar: THREE.Vector3
  /** The four glyph pillars around the altar, clockwise from the north-west. */
  pillars: HallPillar[]
  gate: HallGate
}

/** The sealed north gate to the Singing Vale. The Choir Sequence opens it; a loaded save opens it instantly. */
export class HallGate {
  private progress = 0
  private opening = false

  constructor(
    private readonly leaves: readonly [THREE.Object3D, THREE.Object3D],
    private readonly seal: THREE.MeshStandardMaterial,
    private readonly collider: BoxCollider,
  ) {}

  get isOpen(): boolean {
    return this.progress >= 1
  }

  open(instant = false) {
    this.opening = true
    if (instant) {
      this.progress = 1
      this.apply(1)
    }
  }

  /** Slides both leaves into the pylons; the way is passable from a little before halfway. */
  readonly update: Animator = (dt) => {
    if (!this.opening || this.progress >= 1) return
    this.progress = Math.min(1, this.progress + dt / GATE.openSeconds)
    this.apply(this.progress)
  }

  private apply(t: number) {
    const eased = t * t * (3 - 2 * t)
    this.leaves[0].position.x = -eased * GATE.leafWidth
    this.leaves[1].position.x = eased * GATE.leafWidth
    this.seal.emissiveIntensity = 0.7 + 5 * Math.sin(Math.PI * t)
    if (t > 0.45) this.collider.enabled = false
  }
}

/** Static parts collected per material and merged once; animated or individually lit parts go straight to `root`. */
interface Kit {
  root: THREE.Group
  collision: Collision
  random: () => number
  stone: THREE.BufferGeometry[]
  weathered: THREE.BufferGeometry[]
  inlay: THREE.BufferGeometry[]
}

/** The Hall of Echoes: a ruined temple filling the ridge pass between the Cradle and the Singing Vale. */
export function buildHall(context: StructureContext): Hall {
  const root = new THREE.Group()
  root.name = 'hall'
  const kit: Kit = { root, collision: context.collision, random: mulberry32(41), stone: [], weathered: [], inlay: [] }
  buildPortal(kit)
  buildColonnade(kit)
  buildWalls(kit)
  const { altar, pillars } = buildSanctum(kit, context.animate)
  const gate = buildGate(kit, context.animate)
  scatterRubble(kit)

  root.add(
    solidMesh(mergeParts(kit.stone, 'hall.stone'), createStoneMaterial('#857a70')),
    solidMesh(mergeParts(kit.weathered, 'hall.weathered'), createStoneMaterial('#665b55')),
    new THREE.Mesh(mergeParts(kit.inlay, 'hall.inlay'), createEnergyMaterial('#56e6ff', 0.9)),
  )
  context.scene.add(root)
  buildHallEchoes(context)
  return { altar, pillars, gate }
}

/** South portal: two pylons sunk into the cliffs, the lintel snapped in the middle and its east half sagging. */
function buildPortal({ collision, stone, inlay, random }: Kit) {
  const z = PLAN.portalZ
  const floor = collision.groundHeight(HALL.x, z)
  for (const side of [-1, 1]) {
    const x = HALL.x + side * 8.6
    const base = lowest(collision, x, z, 1.9, 2.2) - 0.8
    const top = floor + 13.5
    stone.push(block(3.8, top - base, 4.4, 0.8).translate(x, base, z))
    collision.addBox(x, z, 1.9, 2.2, 0, base, top)
  }

  const y = floor + 10.4
  stone.push(new THREE.BoxGeometry(9.6, 1.6, 3).translate(HALL.x - 3.8, y + 0.8, z))
  collision.addBox(HALL.x - 3.8, z, 4.8, 1.5, 0, y, y + 1.6)
  stone.push(new THREE.BoxGeometry(6.2, 1.6, 3).rotateZ(0.11).translate(HALL.x + 5.6, y + 0.45, z))
  collision.addBox(HALL.x + 5.6, z, 3.1, 1.5, 0, y - 0.3, y + 1.6)
  for (let gx = HALL.x - 6.7; gx < HALL.x + 0.6; gx += 0.45 + random() * 0.5) {
    inlay.push(new THREE.BoxGeometry(0.1, 0.25 + random() * 0.7, 0.04).translate(gx, y + 0.8, z + 1.52))
  }

  // The broken-out middle of the lintel, fallen at the threshold.
  const chunk = { x: HALL.x + 1.6, z: z + 2.2, yaw: 0.45 }
  const chunkFloor = collision.groundHeight(chunk.x, chunk.z)
  stone.push(
    new THREE.BoxGeometry(2.6, 1.6, 3).rotateZ(0.12).rotateY(chunk.yaw).translate(chunk.x, chunkFloor + 0.55, chunk.z),
  )
  collision.addBox(chunk.x, chunk.z, 1.4, 1.5, chunk.yaw, chunkFloor - 0.5, chunkFloor + 1.3)
}

/** Colonnade along the aisle. Only the southern row still carries its lintel; the next one's lies broken below it. */
function buildColonnade({ collision, stone, weathered, random }: Kit) {
  PLAN.rows.forEach((z, row) => {
    for (let index = 0; index < 2; index++) {
      const side = index === 0 ? -1 : 1
      const x = HALL.x + side * PLAN.columnX
      const height = RUIN[row][index]
      const floor = collision.groundHeight(x, z)
      weathered.push(block(1.5, 1.1, 1.5).translate(x, floor - 0.6, z))
      if (height > 0) {
        const intact = height >= PLAN.columnHeight
        const shaft = intact ? height - 0.95 : height - 0.5
        stone.push(new THREE.CylinderGeometry(0.5, 0.58, shaft, 12).translate(x, floor + 0.5 + shaft / 2, z))
        if (intact) stone.push(block(1.4, 0.45, 1.4).translate(x, floor + 0.5 + shaft, z))
      }
      collision.addCylinder(x, z, height > 0 ? 0.62 : 0.8, floor - 0.6, floor + Math.max(0.5, height))
      if (height >= PLAN.columnHeight) continue

      // Fallen drums, rolled toward the wall so the aisle stays clear.
      const drums = height > 0 ? 2 : 3
      for (let i = 0; i < drums; i++) {
        const dx = x + side * (1.3 + random())
        const dz = z + (random() - 0.5) * 4
        const yaw = Math.PI / 2 + (random() - 0.5) * 0.8
        const drumFloor = collision.groundHeight(dx, dz)
        stone.push(
          new THREE.CylinderGeometry(0.5, 0.55, 1.5, 12)
            .rotateZ(Math.PI / 2)
            .rotateY(yaw)
            .translate(dx, drumFloor + 0.45, dz),
        )
        collision.addBox(dx, dz, 0.75, 0.5, yaw, drumFloor - 0.5, drumFloor + 0.95)
      }
    }
  })

  const [southZ, nextZ] = PLAN.rows
  const span = PLAN.columnX * 2 + 1.4
  const top =
    Math.min(
      collision.groundHeight(HALL.x - PLAN.columnX, southZ),
      collision.groundHeight(HALL.x + PLAN.columnX, southZ),
    ) + PLAN.columnHeight
  stone.push(block(span, 0.8, 1.3).translate(HALL.x, top, southZ))
  collision.addBox(HALL.x, southZ, span / 2, 0.65, 0, top, top + 0.8)

  const nextFloor = collision.groundHeight(HALL.x, nextZ)
  for (const piece of [
    { x: HALL.x + 3, z: nextZ - 2.4, length: 7.4, yaw: 0.3 },
    { x: HALL.x - 5.7, z: nextZ - 3.6, length: 4.6, yaw: -0.25 },
  ]) {
    stone.push(
      new THREE.BoxGeometry(piece.length, 0.8, 1.3).rotateY(piece.yaw).translate(piece.x, nextFloor + 0.4, piece.z),
    )
    collision.addBox(piece.x, piece.z, piece.length / 2, 0.65, piece.yaw, nextFloor - 0.5, nextFloor + 0.8)
  }
}

/** Masonry facing the cliffs on both sides between the portal and the gate; some courses have toppled. */
function buildWalls({ collision, weathered, random }: Kit) {
  for (const side of [-1, 1]) {
    const x = HALL.x + side * 9.1
    let z = PLAN.gateZ + 3.2
    while (z < PLAN.portalZ - 3) {
      const length = 3.4 + random() * 1.2
      const cz = z + length / 2
      const base = collision.groundHeight(x - side * 0.7, cz) - 0.6
      const height = random() < 0.25 ? 1 + random() * 0.8 : 2.6 + random() * 3.8
      weathered.push(block(1.4, height + 0.6, length - 0.15).translate(x, base, cz))
      collision.addBox(x, cz, 0.7, length / 2, 0, base, base + height + 0.6)
      z += length
    }
  }
}

/** The sanctum: a two-tier dais with the altar, its hovering resonator, and the four glyph pillars. */
function buildSanctum({ root, collision, stone, weathered, inlay }: Kit, animate: StructureContext['animate']) {
  const { x, z } = HALL
  const floor = collision.groundHeight(x, z)
  const footing = floor - 0.6
  const tier1 = floor + 0.25
  const tier2 = floor + 0.5
  weathered.push(
    new THREE.CylinderGeometry(PLAN.daisRadius, PLAN.daisRadius + 0.3, tier1 - footing, 8)
      .rotateY(Math.PI / 8)
      .translate(x, (tier1 + footing) / 2, z),
    new THREE.CylinderGeometry(3.4, 3.6, tier2 - footing, 8).rotateY(Math.PI / 8).translate(x, (tier2 + footing) / 2, z),
  )
  // Octagon colliders sit between the inradius and circumradius.
  collision.addCylinder(x, z, PLAN.daisRadius - 0.3, footing, tier1)
  collision.addCylinder(x, z, 3.25, footing, tier2)

  stone.push(
    block(2.8, 0.5, 1.9).translate(x, tier2, z),
    block(2.2, 0.85, 1.4, 0.92).translate(x, tier2 + 0.5, z),
    block(2.6, 0.22, 1.75).translate(x, tier2 + 1.35, z),
  )
  const altarTop = tier2 + 1.57
  inlay.push(new THREE.TorusGeometry(0.42, 0.035, 4, 40).rotateX(-Math.PI / 2).translate(x, altarTop + 0.01, z))
  for (let i = 0; i < 6; i++) {
    inlay.push(
      new THREE.BoxGeometry(0.26, 0.03, 0.05)
        .translate(0.62, 0, 0)
        .rotateY((i / 6) * Math.PI * 2)
        .translate(x, altarTop + 0.01, z),
    )
  }
  collision.addBox(x, z, 1.4, 0.95, 0, footing, altarTop)

  const resonator = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), createEnergyMaterial('#56e6ff', 3))
  resonator.position.set(x, altarTop + 1.2, z)
  root.add(resonator)
  animate((_dt, time) => {
    resonator.rotation.y = time * 0.5
    resonator.position.y = altarTop + 1.2 + Math.sin(time * 0.9) * 0.12
  })

  const pillars: HallPillar[] = []
  for (let i = 0; i < 4; i++) {
    const angle = THREE.MathUtils.degToRad(-135 + i * 90)
    const px = x + Math.cos(angle) * PLAN.pillarRadius
    const pz = z + Math.sin(angle) * PLAN.pillarRadius
    // Local +z faces the altar.
    const facing = Math.atan2(-Math.cos(angle), -Math.sin(angle))
    const place = (geometry: THREE.BufferGeometry) => geometry.rotateY(facing).translate(px, tier1, pz)
    stone.push(
      place(block(1.5, 0.4, 1.5)),
      place(block(1, 4.4, 1).translate(0, 0.4, 0)),
      place(block(1.35, 0.35, 1.35).translate(0, 4.8, 0)),
      place(block(0.9, 0.3, 0.9).translate(0, 5.15, 0)),
    )
    collision.addCylinder(px, pz, 0.78, footing, tier1 + 5.45)
    const glyph = createEnergyMaterial('#56e6ff', 0.25)
    root.add(new THREE.Mesh(place(glyphMark(101 + i * 17).translate(0, 2.7, 0.52)), glyph))
    pillars.push({ position: new THREE.Vector3(px, tier1, pz), glyph })
  }
  return { altar: new THREE.Vector3(x, altarTop, z), pillars }
}

/** A pillar's sigil: a ring and stem with seeded ticks and dots, so each of the four reads differently. */
function glyphMark(seed: number): THREE.BufferGeometry {
  const random = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = [
    new THREE.TorusGeometry(0.3, 0.03, 4, 40),
    new THREE.BoxGeometry(0.06, 1.1, 0.04),
  ]
  const ticks = 3 + Math.floor(random() * 3)
  for (let i = 0; i < ticks; i++) {
    const outer = random() < 0.5
    const length = outer ? 0.08 + random() * 0.05 : 0.1 + random() * 0.08
    const start = outer ? 0.33 : 0.27 - length
    parts.push(
      new THREE.BoxGeometry(length, 0.045, 0.04).translate(start + length / 2, 0, 0).rotateZ(random() * Math.PI * 2),
    )
  }
  const dots = 1 + Math.floor(random() * 3)
  for (let i = 0; i < dots; i++) {
    parts.push(new THREE.BoxGeometry(0.08, 0.08, 0.04).translate((random() - 0.5) * 0.3, (random() - 0.5) * 0.3, 0))
  }
  return mergeParts(parts, 'hall.glyph')
}

/** North gate: pylons sunk into both cliffs, a lintel, and two sealed leaves carrying the halves of the seal. */
function buildGate({ root, collision, stone, inlay, random }: Kit, animate: StructureContext['animate']): HallGate {
  const z = PLAN.gateZ
  const floor = collision.groundHeight(HALL.x, z)
  const top = floor + 14.5
  for (const side of [-1, 1]) {
    const x = HALL.x + side * 8.4
    const base = lowest(collision, x, z, 3.8, 2.1) - 0.8
    stone.push(block(7.6, top - base, 4.2).translate(x, base, z))
    collision.addBox(x, z, 3.8, 2.1, 0, base, top)
  }
  const lintelY = floor + GATE.leafHeight
  stone.push(block(11.6, 1.9, 3.4).translate(HALL.x, lintelY, z))
  collision.addBox(HALL.x, z, 5.8, 1.7, 0, lintelY, lintelY + 1.9)
  for (let gx = HALL.x - 4.4; gx < HALL.x + 4.4; gx += 0.5 + random() * 0.4) {
    inlay.push(new THREE.BoxGeometry(0.1, 0.3 + random() * 0.9, 0.04).translate(gx, lintelY + 0.95, z + 1.72))
  }

  const door = createStoneMaterial('#5d5450')
  const seal = createEnergyMaterial('#56e6ff', 0.7)
  const frame = new THREE.Group()
  frame.name = 'hall.gate'
  frame.position.set(HALL.x, floor, z)
  const leaves = ([-1, 1] as const).map((side) => {
    const pivot = new THREE.Group()
    const leaf = solidMesh(
      block(GATE.leafWidth - 0.04, GATE.leafHeight + 0.3, GATE.leafDepth).translate((side * GATE.leafWidth) / 2, -0.3, 0),
      door,
    )
    const sigil = new THREE.Mesh(sealHalf(side), seal)
    sigil.position.set(0, GATE.leafHeight / 2, GATE.leafDepth / 2 + 0.02)
    pivot.add(leaf, sigil)
    frame.add(pivot)
    return pivot
  }) as [THREE.Group, THREE.Group]
  root.add(frame)

  const collider = collision.addBox(HALL.x, z, GATE.leafWidth, 0.6, 0, floor - 1, floor + GATE.leafHeight)
  const gate = new HallGate(leaves, seal, collider)
  animate(gate.update)
  return gate
}

/** One leaf's half of the seal (`side` −1 west, 1 east): ring arcs and spokes, split along the seam. */
function sealHalf(side: -1 | 1): THREE.BufferGeometry {
  const turn = side < 0 ? Math.PI / 2 : -Math.PI / 2
  const parts: THREE.BufferGeometry[] = [
    new THREE.TorusGeometry(2.4, 0.08, 4, 36, Math.PI).rotateZ(turn),
    new THREE.TorusGeometry(1.4, 0.06, 4, 24, Math.PI).rotateZ(turn),
    new THREE.BoxGeometry(0.07, 2.2, 0.04).translate(side * 0.25, 0, 0),
  ]
  for (let i = 0; i < 4; i++) {
    parts.push(new THREE.BoxGeometry(0.9, 0.07, 0.04).translate(1.9, 0, 0).rotateZ(turn + Math.PI / 8 + (i * Math.PI) / 4))
  }
  return mergeParts(parts, 'hall.seal')
}

/** Loose rubble along the wall feet; the aisle stays clear. */
function scatterRubble({ collision, weathered, random }: Kit) {
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3()
  for (let i = 0; i < 46; i++) {
    const side = random() < 0.5 ? -1 : 1
    const x = HALL.x + side * (6.9 + random() * 1.6)
    const z = PLAN.gateZ + 3 + random() * (PLAN.portalZ - PLAN.gateZ - 5)
    const size = 0.2 + random() ** 2 * 0.8
    euler.set(random() * 3, random() * 3, random() * 3)
    rotation.setFromEuler(euler)
    scale.set(size * (0.7 + random() * 0.8), size * (0.5 + random() * 0.6), size * (0.7 + random() * 0.8))
    position.set(x, collision.groundHeight(x, z) + size * 0.15, z)
    weathered.push(new THREE.BoxGeometry(1, 1, 1).applyMatrix4(matrix.compose(position, rotation, scale)))
  }
}

/** Echo content: the temple as it stood, whole and roofed, plus crystals at the portal and by the gate. */
function buildHallEchoes({ scene, collision, reactives }: StructureContext) {
  const floor = collision.groundHeight(HALL.x, HALL.z)
  const top = floor + PLAN.columnHeight
  const span = PLAN.columnX * 2 + 1.4
  const parts: THREE.BufferGeometry[] = []
  for (const z of PLAN.rows) {
    for (const side of [-1, 1]) {
      parts.push(
        new THREE.CylinderGeometry(0.5, 0.58, PLAN.columnHeight, 12).translate(
          HALL.x + side * PLAN.columnX,
          floor + PLAN.columnHeight / 2,
          z,
        ),
      )
    }
    parts.push(block(span, 0.8, 1.3).translate(HALL.x, top, z))
  }
  for (let z = PLAN.gateZ + 4; z <= PLAN.portalZ - 3; z += 3) {
    parts.push(new THREE.BoxGeometry(span + 1, 0.45, 0.6).translate(HALL.x, top + 1.03, z))
  }
  const portalFloor = collision.groundHeight(HALL.x, PLAN.portalZ)
  parts.push(new THREE.BoxGeometry(19, 1.6, 3).translate(HALL.x, portalFloor + 11.2, PLAN.portalZ))
  const temple = new THREE.Group()
  temple.name = 'hall.templePast'
  temple.add(new THREE.Mesh(mergeParts(parts, 'hall.past')))
  reactives.add(new PastStateOverlay(scene, temple))

  reactives.add(
    new CrystalCluster(scene, collision, { x: HALL.x - 6.4, z: PLAN.portalZ + 4.5, count: 6, spread: 1.8, seed: 31, size: 0.75 }),
  )
  reactives.add(
    new CrystalCluster(scene, collision, { x: HALL.x + 6.9, z: PLAN.gateZ + 4.6, count: 5, spread: 1.3, seed: 37, size: 0.6 }),
  )
}

const CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const

/** Lowest ground under an axis-aligned footprint, so footings never float on the downhill side. */
function lowest(collision: Collision, x: number, z: number, halfX: number, halfZ: number): number {
  let low = collision.groundHeight(x, z)
  for (const [sx, sz] of CORNERS) low = Math.min(low, collision.groundHeight(x + sx * halfX, z + sz * halfZ))
  return low
}

function solidMesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}
