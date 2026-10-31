import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { GhostScene } from '../../echo/ghosts'
import { PastStateOverlay } from '../../echo/pastState'
import type { BoxCollider, Collision } from '../../physics/collision'
import { Batch, block, mergeParts } from '../geometry'
import { GRID_NODES, type Point2, UNDERVAULT, VAULT, vaultPoint, WORKS } from '../layout'
import { createEnergyMaterial, createMetalMaterial, createStoneMaterial } from '../materials'
import { mulberry32 } from '../noise'
import type { Animator, StructureContext } from './context'

const AMBER = '#ffa640'
/** Emissive intensity of dormant and fully charged grid parts. */
const DORMANT = 0.16
const CHARGED = 3.4
const DEG = Math.PI / 180

const DAIS = { radius: 7.2, height: 0.4 }
/** Reactor cage: beams lean in from the dais rim to a crown ring above the core. */
const CAGE = { foot: 6.3, crown: 2.8, height: 8.5, midY: 4.2 }
const CAGE_LEAN = Math.atan2(CAGE.foot - CAGE.crown, CAGE.height)
const BEAM_LENGTH = Math.hypot(CAGE.foot - CAGE.crown, CAGE.height)
/** Beam angles (degrees, atan2(z − cz, x − cx) around the hub) and how much of each still stands. */
const BEAMS: readonly (readonly [number, number])[] = [
  [30, 1],
  [90, 0.42],
  [150, 1],
  [210, 1],
  [270, 0.3],
  [330, 1],
]
/** Core centre above the dais top. */
const CORE_LIFT = 5.4
const PLINTH = { radius: 2, height: 0.4 }
/** Node cell centre above the plinth top. */
const CELL_LIFT = 3.3
const DOOR = { halfWidth: 2.2, height: 5.2, thickness: 0.9, sink: 5.7, openSeconds: 5 }

/** Hyperboloid cooling towers: base radius, waist radius (at 72 % of full height), full height. */
const TOWER = { base: 5.2, waist: 3.2, height: 17 }
const TOWERS = [
  { angle: 104, r: 24, height: TOWER.height },
  { angle: 40, r: 26, height: 10.5 },
] as const
const WAIST_Y = TOWER.height * 0.72
const WAIST_A = WAIST_Y / Math.sqrt((TOWER.base / TOWER.waist) ** 2 - 1)
const towerRadius = (y: number) => TOWER.waist * Math.sqrt(1 + ((y - WAIST_Y) / WAIST_A) ** 2)

export interface GridNode {
  /** Centre of the plinth top (world): the Dormant Grid measures pulse range from here. */
  readonly position: THREE.Vector3
  /** 0 dormant … 1 fully charged. */
  readonly charge: number
  /** Lights the node's cell, plinth ring and floor conduit to the hub. */
  setCharge(level: number): void
}

export interface ConduitWorks {
  /** The three Dormant Grid nodes, in `GRID_NODES` order. */
  readonly nodes: readonly GridNode[]
  /** Centre of the dormant core floating in the hub cage (world). */
  readonly core: THREE.Vector3
  /** Wakes the core, the hub rings and the main conduit to the vault: 0 dormant … 1 powered. */
  setPower(level: number): void
  /** The Undervault's sealed door; the completed grid opens it. */
  readonly door: VaultDoor
}

class PowerNode implements GridNode {
  charge = 0
  private readonly sparkY: number

  constructor(
    readonly position: THREE.Vector3,
    readonly glow: THREE.MeshStandardMaterial,
    private readonly spark: THREE.Object3D,
  ) {
    this.sparkY = spark.position.y
    this.setCharge(0)
  }

  setCharge(level: number) {
    this.charge = THREE.MathUtils.clamp(level, 0, 1)
    this.glow.emissiveIntensity = THREE.MathUtils.lerp(DORMANT, CHARGED, this.charge)
  }

  readonly update: Animator = (dt, time) => {
    this.spark.rotation.y += dt * (0.4 + 5 * this.charge)
    this.spark.position.y = this.sparkY + Math.sin(time * 1.7 + this.position.x) * 0.12
    this.spark.scale.setScalar(0.6 + 0.6 * this.charge)
  }
}

/** The Undervault's sealed door. The completed Dormant Grid sinks it into the threshold; a loaded save opens it instantly. */
export class VaultDoor {
  private progress = 0
  private opening = false
  private readonly top: number

  constructor(
    private readonly slab: THREE.Object3D,
    private readonly seal: THREE.MeshStandardMaterial,
    private readonly collider: BoxCollider,
  ) {
    this.top = collider.maxY
  }

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

  /** Sinks the slab; its collider top follows it down, so the last of it is a step the player can walk over. */
  readonly update: Animator = (dt) => {
    if (!this.opening || this.progress >= 1) return
    this.progress = Math.min(1, this.progress + dt / DOOR.openSeconds)
    this.apply(this.progress)
  }

  private apply(t: number) {
    const sunk = t * t * (3 - 2 * t) * DOOR.sink
    this.slab.position.y = -sunk
    this.collider.maxY = this.top - sunk
    this.seal.emissiveIntensity = DORMANT * 2 + 5 * Math.sin(Math.PI * t)
    if (t >= 1) this.collider.enabled = false
  }
}

interface Materials {
  metal: THREE.Material
  dark: THREE.Material
  concrete: THREE.Material
  /** Double-sided: the cooling towers are open shells seen from inside too. */
  tower: THREE.Material
  amber: THREE.Material
  /** Hub core, hub rings and the main conduit; `setPower` drives it. */
  power: THREE.MeshStandardMaterial
}

/** World (x, z) at `angle` degrees and `r` metres from the hub centre. */
function polar(angle: number, r: number): { x: number; z: number } {
  return { x: WORKS.x + Math.cos(angle * DEG) * r, z: WORKS.z + Math.sin(angle * DEG) * r }
}

const angleOf = (x: number, z: number) => Math.atan2(z - WORKS.z, x - WORKS.x) / DEG
const distanceOf = (x: number, z: number) => Math.hypot(x - WORKS.x, z - WORKS.z)

/** Conduit Works: reactor hub, three Dormant Grid nodes, cooling towers and tanks, and the sealed Undervault bunker. */
export function buildWorks(context: StructureContext): ConduitWorks {
  const { scene, collision, animate } = context
  const tower = createStoneMaterial('#77706a')
  tower.side = THREE.DoubleSide
  const m: Materials = {
    metal: createMetalMaterial('#6a7270'),
    dark: createMetalMaterial('#3d4345'),
    concrete: createStoneMaterial('#7d766f'),
    tower,
    amber: createEnergyMaterial(AMBER, 0.5),
    power: createEnergyMaterial(AMBER, DORMANT),
  }
  const floor = collision.groundHeight(WORKS.x, WORKS.z)
  const front = VAULT.halfDepth + VAULT.wall / 2
  const doorAt = vaultPoint(0, front)
  const vaultBase = collision.groundHeight(doorAt.x, doorAt.z)
  const threshold = vaultPoint(0, front + VAULT.wall / 2 + 1.4)
  const state = { power: 0 }

  const batch = new Batch()
  const nodes = GRID_NODES.map((point, index) => buildNode(context, batch, m, point, index))
  const core = buildHub(context, batch, m, floor, nodes, threshold, state)
  buildYard(collision, batch, m, floor)
  batch.build(scene, 'works', m.amber, m.power, ...nodes.map((node) => node.glow))
  for (const node of nodes) animate(node.update)

  const door = buildVault(context, m, vaultBase)
  buildWorksEchoes(context, floor, vaultBase, nodes, core, threshold)

  return {
    nodes,
    core,
    door,
    setPower(level: number) {
      state.power = THREE.MathUtils.clamp(level, 0, 1)
      m.power.emissiveIntensity = THREE.MathUtils.lerp(DORMANT, CHARGED, state.power)
    },
  }
}

/** One cage beam (or what stands of it) leaning in from the dais rim; geometry in world space. */
function cageBeam(angle: number, standing: number, top: number): THREE.BufferGeometry {
  const p = polar(angle, CAGE.foot - (CAGE.foot - CAGE.crown) * standing * 0.5)
  return new THREE.BoxGeometry(0.42, BEAM_LENGTH * standing, 0.62)
    .rotateZ(CAGE_LEAN)
    .rotateY(-angle * DEG)
    .translate(p.x, top + CAGE.height * standing * 0.5, p.z)
}

/** Horizontal ring arc around the hub covering [from, from + arc] degrees; geometry in world space. */
function cageRing(radius: number, tube: number, y: number, from: number, arc: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(radius, tube, 6, 48, arc * DEG)
    .rotateX(Math.PI / 2)
    .rotateY(-from * DEG)
    .translate(WORKS.x, y, WORKS.z)
}

const midRingRadius = CAGE.foot - (CAGE.foot - CAGE.crown) * (CAGE.midY / CAGE.height)

/** Hub: dais with the broken reactor cage, the dormant core inside it, and floor conduits to every node and the vault. */
function buildHub(
  { scene, collision, animate }: StructureContext,
  batch: Batch,
  m: Materials,
  floor: number,
  nodes: readonly PowerNode[],
  threshold: { x: number; z: number },
  state: { power: number },
): THREE.Vector3 {
  const { x, z } = WORKS
  const top = floor + DAIS.height
  batch.add(m.concrete, new THREE.CylinderGeometry(DAIS.radius, DAIS.radius + 0.25, DAIS.height + 0.8, 8), x, floor - 0.2, z, {
    y: Math.PI / 8,
  })
  collision.addCylinder(x, z, DAIS.radius - 0.15, floor - 0.8, top)
  batch.add(m.concrete, new THREE.CylinderGeometry(2.6, 2.8, 0.35, 8), x, top + 0.175, z, { y: Math.PI / 8 })
  collision.addCylinder(x, z, 2.6, top, top + 0.35)
  batch.add(m.power, new THREE.TorusGeometry(4.7, 0.06, 4, 48).rotateX(Math.PI / 2), x, top + 0.005, z)
  batch.add(m.power, new THREE.TorusGeometry(2.1, 0.05, 4, 40).rotateX(Math.PI / 2), x, top + 0.355, z)

  for (const [angle, standing] of BEAMS) {
    batch.add(m.metal, cageBeam(angle, standing, top), 0, 0, 0)
    const foot = polar(angle, CAGE.foot)
    batch.add(m.dark, block(1.2, 0.7, 1.2).rotateY(-angle * DEG), foot.x, top, foot.z)
    collision.addBox(foot.x, foot.z, 0.6, 0.6, -angle * DEG, top, top + 0.7)
    const low = polar(angle, CAGE.foot - 0.65)
    collision.addCylinder(low.x, low.z, 0.5, top + 0.7, top + 2.6)
  }
  batch.add(m.dark, cageRing(CAGE.crown, 0.16, top + CAGE.height, 330, 240), 0, 0, 0)
  batch.add(m.dark, cageRing(midRingRadius, 0.13, top + CAGE.midY, 30, 180), 0, 0, 0)

  for (const node of nodes) {
    const { x: nx, z: nz } = node.position
    conduit(batch, m, node.glow, angleOf(nx, nz), DAIS.radius + 0.1, distanceOf(nx, nz) - PLINTH.radius - 0.1, floor)
  }
  conduit(batch, m, m.power, angleOf(threshold.x, threshold.z), DAIS.radius + 0.1, distanceOf(threshold.x, threshold.z), floor)

  const coreAt = new THREE.Vector3(x, top + CORE_LIFT, z)
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 0), m.power)
  core.name = 'works.core'
  core.position.copy(coreAt)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.07, 4, 40), m.power)
  halo.name = 'works.coreHalo'
  halo.position.copy(coreAt)
  scene.add(core, halo)
  animate((dt, time) => {
    core.rotation.y += dt * (0.2 + 1.6 * state.power)
    core.rotation.x = Math.sin(time * 0.3) * 0.4
    core.position.y = coreAt.y + Math.sin(time * 0.8) * (0.08 + 0.12 * state.power)
    halo.rotation.set(Math.PI / 2 + Math.sin(time * 0.37) * 0.35, time * (0.3 + 1.2 * state.power), 0)
  })
  return coreAt
}

/** A floor channel from `from` to `to` metres out along `angle`: a dark trough with a glowing strip. */
function conduit(batch: Batch, m: Materials, glow: THREE.Material, angle: number, from: number, to: number, floor: number) {
  const length = to - from
  const mid = polar(angle, (from + to) / 2)
  batch.add(m.dark, new THREE.BoxGeometry(length, 0.14, 0.7).rotateY(-angle * DEG), mid.x, floor + 0.05, mid.z)
  batch.add(glow, new THREE.BoxGeometry(length, 0.05, 0.2).rotateY(-angle * DEG), mid.x, floor + 0.13, mid.z)
}

/** A Dormant Grid node: plinth, coiled capacitor column and a caged cell that glows with its charge. */
function buildNode({ scene, collision }: StructureContext, batch: Batch, m: Materials, [x, z]: Point2, index: number): PowerNode {
  const ground = collision.groundHeight(x, z)
  const top = ground + PLINTH.height
  const glow = createEnergyMaterial(AMBER, DORMANT)
  batch.add(m.concrete, new THREE.CylinderGeometry(PLINTH.radius, PLINTH.radius + 0.2, PLINTH.height + 0.8, 8), x, ground - 0.2, z, {
    y: Math.PI / 8,
  })
  collision.addCylinder(x, z, PLINTH.radius - 0.1, ground - 0.8, top)
  batch.add(glow, new THREE.TorusGeometry(1.55, 0.05, 4, 32).rotateX(Math.PI / 2), x, top + 0.005, z)

  batch.add(m.metal, new THREE.CylinderGeometry(0.42, 0.56, 2.8, 10), x, top + 1.4, z)
  for (const y of [0.6, 1.3, 2]) {
    batch.add(m.dark, new THREE.TorusGeometry(0.7, 0.13, 6, 20).rotateX(Math.PI / 2), x, top + y, z)
  }
  batch.add(glow, new THREE.CylinderGeometry(0.3, 0.3, 1, 10), x, top + CELL_LIFT, z)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + index
    batch.add(m.dark, new THREE.BoxGeometry(0.09, 1.15, 0.09), x + Math.cos(a) * 0.42, top + CELL_LIFT, z + Math.sin(a) * 0.42)
  }
  batch.add(m.metal, new THREE.CylinderGeometry(0.58, 0.46, 0.3, 10), x, top + 3.95, z)
  collision.addCylinder(x, z, 0.78, top, top + 4.1)

  const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), glow)
  spark.name = `works.node${index}.spark`
  spark.position.set(x, top + 4.75, z)
  scene.add(spark)
  return new PowerNode(new THREE.Vector3(x, top, z), glow, spark)
}

/** `points` for a LatheGeometry of the tower shell between heights `from` and `to`. */
function towerProfile(from: number, to: number): THREE.Vector2[] {
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= 16; i++) {
    const y = from + ((to - from) * i) / 16
    points.push(new THREE.Vector2(towerRadius(y), y))
  }
  return points
}

function buildTower(collision: Collision, batch: Batch, m: Materials, spec: (typeof TOWERS)[number]) {
  const { x, z } = polar(spec.angle, spec.r)
  const ground = collision.groundHeight(x, z)
  batch.add(m.concrete, new THREE.CylinderGeometry(TOWER.base + 0.6, TOWER.base + 0.9, 1.3, 20), x, ground - 0.05, z)
  batch.add(m.tower, new THREE.LatheGeometry(towerProfile(0, spec.height), 32), x, ground + 0.5, z)
  batch.add(m.dark, new THREE.TorusGeometry(towerRadius(spec.height), 0.22, 6, 40).rotateX(Math.PI / 2), x, ground + 0.5 + spec.height, z)
  collision.addCylinder(x, z, TOWER.base + 0.6, ground - 0.7, ground + 0.6)
  collision.addCylinder(x, z, TOWER.base, ground + 0.6, ground + 0.5 + spec.height)
  return { x, z, ground }
}

/** Yard dressing: cooling towers (one snapped), twin tanks, a pipe run to the tower, a fallen cage beam, crates. */
function buildYard(collision: Collision, batch: Batch, m: Materials, floor: number) {
  const [intact, broken] = TOWERS.map((spec) => buildTower(collision, batch, m, spec))
  const bandY = TOWER.height - 1.4
  batch.add(
    m.amber,
    new THREE.TorusGeometry(towerRadius(bandY) + 0.05, 0.09, 4, 48).rotateX(Math.PI / 2),
    intact.x,
    intact.ground + 0.5 + bandY,
    intact.z,
  )
  // Shell fragments of the snapped tower, low enough to step onto.
  for (const [angle, distance, yaw, tilt] of [
    [10, 7.6, 0.4, 0.08],
    [62, 8.2, 1.9, 0.12],
    [104, 7.4, -0.7, 0.05],
  ]) {
    const x = broken.x + Math.cos(angle * DEG) * distance
    const z = broken.z + Math.sin(angle * DEG) * distance
    const ground = collision.groundHeight(x, z)
    batch.add(m.tower, block(3.2, 0.35, 2.2).rotateX(tilt).rotateY(yaw), x, ground - 0.05, z)
    collision.addBox(x, z, 1.6, 1.1, yaw, ground, ground + 0.35)
  }

  for (const angle of [158, 172]) {
    const { x, z } = polar(angle, 19.5)
    tank(collision, batch, m, x, z, 165)
  }

  // Pipe run: rises out of the ground by the dais and enters the intact tower at shoulder height.
  const pipeAngle = TOWERS[0].angle
  const pipeY = floor + 3.6
  const from = DAIS.radius + 0.6
  const to = TOWERS[0].r - 4
  const riser = polar(pipeAngle, from)
  batch.add(m.metal, new THREE.CylinderGeometry(0.38, 0.38, 3.6 + 0.38, 12), riser.x, floor + (3.6 + 0.38) / 2, riser.z)
  collision.addCylinder(riser.x, riser.z, 0.45, floor, pipeY)
  const mid = polar(pipeAngle, (from + to) / 2)
  batch.add(
    m.metal,
    new THREE.CylinderGeometry(0.38, 0.38, to - from, 12).rotateZ(Math.PI / 2).rotateY(-pipeAngle * DEG),
    mid.x,
    pipeY,
    mid.z,
  )
  for (const r of [10, 13.5, 17]) {
    const p = polar(pipeAngle, r)
    batch.add(m.dark, block(0.32, 3.25, 0.32), p.x, floor, p.z)
    batch.add(m.dark, block(0.5, 0.25, 1.5).rotateY(-pipeAngle * DEG), p.x, floor + 3.1, p.z)
    collision.addCylinder(p.x, p.z, 0.3, floor, floor + 3.35)
  }

  // A beam that fell out of the cage, lying on the plaza.
  const fallen = polar(284, 12)
  batch.add(m.metal, new THREE.BoxGeometry(8.2, 0.42, 0.62).rotateZ(0.05).rotateY(-284 * DEG), fallen.x, floor + 0.33, fallen.z)
  collision.addBox(fallen.x, fallen.z, 4.1, 0.31, -284 * DEG, floor, floor + 0.6)

  const crateA = polar(232, 16)
  crates(collision, batch, m, crateA.x, crateA.z, 4, 61)
  const crateB = polar(340, 13)
  crates(collision, batch, m, crateB.x, crateB.z, 4, 67)
}

/** Horizontal tank on two saddles, its axis along `axis` degrees. */
function tank(collision: Collision, batch: Batch, m: Materials, x: number, z: number, axis: number) {
  const ground = collision.groundHeight(x, z)
  const yaw = -axis * DEG
  const ux = Math.cos(axis * DEG)
  const uz = Math.sin(axis * DEG)
  const cy = ground + 2.1
  batch.add(m.metal, new THREE.CylinderGeometry(1.6, 1.6, 7, 20).rotateZ(Math.PI / 2).rotateY(yaw), x, cy, z)
  for (const side of [-1, 1]) {
    batch.add(m.dark, new THREE.TorusGeometry(1.62, 0.12, 6, 24).rotateY(Math.PI / 2 + yaw), x + ux * side * 3.2, cy, z + uz * side * 3.2)
    batch.add(m.dark, block(0.9, 1.4, 3.4).rotateY(yaw), x + ux * side * 2.3, ground, z + uz * side * 2.3)
  }
  collision.addBox(x, z, 3.5, 1.65, yaw, ground, ground + 3.7)
}

function crates(collision: Collision, batch: Batch, m: Materials, cx: number, cz: number, count: number, seed: number) {
  const random = mulberry32(seed)
  for (let i = 0; i < count; i++) {
    const angle = random() * Math.PI * 2
    const distance = 0.6 + random() * 2.2
    const x = cx + Math.cos(angle) * distance
    const z = cz + Math.sin(angle) * distance
    const size = 0.9 + random() * 0.7
    const yaw = random() * Math.PI
    const ground = collision.groundHeight(x, z)
    batch.add(i % 2 ? m.metal : m.dark, block(size, size * 0.85, size).rotateY(yaw), x, ground, z)
    collision.addBox(x, z, size / 2, size / 2, yaw, ground, ground + size * 0.85)
  }
}

/** The ring of three nodes around the vault seal: the door says how it opens. */
function vaultSeal(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1.5, 0.07, 4, 40), new THREE.TorusGeometry(0.45, 0.06, 4, 20)]
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3
    parts.push(new THREE.BoxGeometry(1.05, 0.07, 0.04).translate(0.975, 0, 0).rotateZ(a))
    parts.push(new THREE.CircleGeometry(0.2, 12).translate(Math.cos(a) * 1.5, Math.sin(a) * 1.5, 0.03))
  }
  return mergeParts(parts, 'works.seal')
}

/**
 * The Undervault's vault house: a roofless walled bunker, built in its local frame (+z = door side, toward the hub).
 * Colliders get the same transform through `vaultPoint`.
 */
function buildVault({ scene, collision, animate }: StructureContext, m: Materials, base: number): VaultDoor {
  const { halfWidth, halfDepth, wall, height } = VAULT
  const outer = halfWidth + wall
  const front = halfDepth + wall / 2
  const top = base + height
  let low = base
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
    [0, -1],
    [-1, 0],
    [1, 0],
  ]) {
    const p = vaultPoint(sx * outer, sz * (halfDepth + wall))
    low = Math.min(low, collision.groundHeight(p.x, p.z))
  }
  const footing = low - 0.8

  const group = new THREE.Group()
  group.name = 'works.vault'
  group.position.set(UNDERVAULT.x, 0, UNDERVAULT.z)
  group.rotation.y = VAULT.yaw
  const batch = new Batch()
  const solid = (material: THREE.Material, lx: number, lz: number, sx: number, sz: number, y0: number, y1: number, taper = 1) => {
    batch.add(material, block(sx, y1 - y0, sz, taper), lx, y0, lz)
    const p = vaultPoint(lx, lz)
    collision.addBox(p.x, p.z, sx / 2, sz / 2, VAULT.yaw, y0, y1)
  }

  solid(m.concrete, 0, -front, outer * 2, wall, footing, top)
  for (const side of [-1, 1]) solid(m.concrete, side * (halfWidth + wall / 2), 0, wall, halfDepth * 2, footing, top)
  const segment = outer - DOOR.halfWidth
  for (const side of [-1, 1]) solid(m.concrete, side * (DOOR.halfWidth + segment / 2), front, segment, wall, footing, top)
  solid(m.concrete, 0, front, DOOR.halfWidth * 2, wall, base + DOOR.height, top)

  // Metal coping, buttresses outside the back and side walls, and door pylons with dormant glyph strips.
  batch.add(m.dark, block(outer * 2 + 0.3, 0.45, wall + 0.3), 0, top, -front)
  batch.add(m.dark, block(outer * 2 + 0.3, 0.45, wall + 0.3), 0, top, front)
  for (const side of [-1, 1]) batch.add(m.dark, block(wall + 0.3, 0.45, halfDepth * 2), side * (halfWidth + wall / 2), top, 0)
  for (const lx of [-6, 0, 6]) solid(m.concrete, lx, -(outer + 0.8), 1.4, 1.6, footing, base + 6, 0.45)
  for (const side of [-1, 1]) {
    for (const lz of [-5, 3]) solid(m.concrete, side * (outer + 0.8), lz, 1.6, 1.4, footing, base + 6, 0.45)
  }
  const pylonZ = front + wall / 2 + 0.5
  for (const side of [-1, 1]) {
    const lx = side * (DOOR.halfWidth + 0.75)
    solid(m.dark, lx, pylonZ, 1.5, 1, footing, base + DOOR.height + 1.6)
    batch.add(m.amber, new THREE.BoxGeometry(0.12, DOOR.height, 0.04), lx, base + DOOR.height / 2 + 0.4, pylonZ + 0.52)
  }
  batch.add(m.amber, new THREE.BoxGeometry(DOOR.halfWidth * 2 + 1, 0.12, 0.04), 0, base + DOOR.height + 0.5, front + wall / 2 + 0.02)
  batch.add(m.amber, new THREE.BoxGeometry(outer * 2 - 0.4, 0.1, 0.04), 0, base + height - 0.7, front + wall / 2 + 0.02)
  for (const side of [-1, 1]) {
    batch.add(m.dark, block(DOOR.halfWidth * 2 + 0.4, 0.1, 0.25), 0, base - 0.02, front + side * (DOOR.thickness / 2 + 0.125))
  }
  batch.build(group, 'works.vaultWalls', m.amber)

  const seal = createEnergyMaterial(AMBER, DORMANT * 2)
  const pivot = new THREE.Group()
  pivot.name = 'works.vaultDoor'
  pivot.position.set(0, 0, front)
  const slab = new THREE.Mesh(block(DOOR.halfWidth * 2 - 0.1, DOOR.height + 0.2, DOOR.thickness), m.dark)
  slab.position.y = base - 0.2
  slab.castShadow = true
  slab.receiveShadow = true
  const sigil = new THREE.Mesh(vaultSeal(), seal)
  sigil.position.set(0, base + DOOR.height / 2, DOOR.thickness / 2 + 0.02)
  pivot.add(slab, sigil)
  group.add(pivot)
  scene.add(group)

  const doorAt = vaultPoint(0, front)
  const collider = collision.addBox(doorAt.x, doorAt.z, DOOR.halfWidth, wall / 2, VAULT.yaw, base - 1, base + DOOR.height)
  const door = new VaultDoor(pivot, seal, collider)
  animate(door.update)
  return door
}

/** A thin cylinder from `a` to `b`. */
function strut(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const direction = new THREE.Vector3().subVectors(b, a)
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5)
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, direction.normalize()))
  return geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
}

/**
 * Memory: the Works running. The whole cage and tower, the vault roofed over, live arcs from every node to the core
 * (the puzzle's answer: all three at once), and the crew at their posts.
 */
function buildWorksEchoes(
  { scene, collision, reactives }: StructureContext,
  floor: number,
  vaultBase: number,
  nodes: readonly PowerNode[],
  core: THREE.Vector3,
  threshold: { x: number; z: number },
) {
  const top = floor + DAIS.height
  const parts: THREE.BufferGeometry[] = BEAMS.map(([angle]) => cageBeam(angle, 1, top))
  parts.push(cageRing(CAGE.crown, 0.16, top + CAGE.height, 0, 360), cageRing(midRingRadius, 0.13, top + CAGE.midY, 0, 360))
  const snapped = TOWERS[1]
  const stump = polar(snapped.angle, snapped.r)
  parts.push(
    new THREE.LatheGeometry(towerProfile(snapped.height, TOWER.height), 32).translate(
      stump.x,
      collision.groundHeight(stump.x, stump.z) + 0.5,
      stump.z,
    ),
  )
  const vaultSize = (VAULT.halfWidth + VAULT.wall) * 2
  parts.push(
    new THREE.BoxGeometry(vaultSize, 0.9, vaultSize).rotateY(VAULT.yaw).translate(UNDERVAULT.x, vaultBase + VAULT.height + 0.45, UNDERVAULT.z),
  )
  for (const node of nodes) parts.push(strut(node.position.clone().setY(node.position.y + CELL_LIFT), core, 0.08))
  const past = new THREE.Group()
  past.name = 'works.past'
  past.add(new THREE.Mesh(mergeParts(parts, 'works.past')))
  reactives.add(new PastStateOverlay(scene, past))

  const heightAt = (x: number, z: number) => {
    const ground = collision.groundHeight(x, z)
    return distanceOf(x, z) < DAIS.radius ? Math.max(ground, top) : ground
  }
  const at = (angle: number, r: number): Point2 => {
    const p = polar(angle, r)
    return [p.x, p.z]
  }
  const [a, , c] = nodes.map((node) => node.position)
  const toA = angleOf(a.x, a.z)
  const toDoor = angleOf(threshold.x, threshold.z)
  const doorDistance = distanceOf(threshold.x, threshold.z)
  reactives.add(
    new GhostScene(
      scene,
      [
        { path: [at(toA, 6.4), at(toA, 19.6)], speed: 1.1, endPose: 'kneel', lookAt: [a.x, a.z] },
        { path: [at(300, 3.4)], pose: 'reach', lookAt: [WORKS.x, WORKS.z] },
        { path: [at(toDoor, 5.5), at(toDoor, doorDistance - 1.2)], speed: 1.3, delay: 0.4, lookAt: [UNDERVAULT.x, UNDERVAULT.z] },
        { path: [at(toDoor + 8, 4.5), at(toDoor + 5, doorDistance - 2.6)], speed: 1.2, delay: 1.5 },
        { path: [at(angleOf(c.x, c.z) - 7, 19.5)], pose: 'kneel', lookAt: [c.x, c.z] },
      ],
      heightAt,
      'works.crew',
    ),
  )

  const near = polar(225, 10)
  reactives.add(new CrystalCluster(scene, collision, { x: near.x, z: near.z, count: 5, spread: 1.4, seed: 53, size: 0.7 }))
  const far = polar(50, 18)
  reactives.add(new CrystalCluster(scene, collision, { x: far.x, z: far.z, count: 6, spread: 1.6, seed: 59, size: 0.8 }))
}
