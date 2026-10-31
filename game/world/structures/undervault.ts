import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { GhostScene } from '../../echo/ghosts'
import { PastStateOverlay } from '../../echo/pastState'
import type { Collision } from '../../physics/collision'
import { Batch, block, mergeParts } from '../geometry'
import {
  type Point2,
  UNDERVAULT,
  UNDERVAULT_FLOOR,
  UNDERVAULT_HOLE,
  VAULT,
  VAULT_THRESHOLD,
  vaultLocal,
  vaultPoint,
} from '../layout'
import { createEnergyMaterial, createMetalMaterial, createStoneMaterial, type MaterialVariant } from '../materials'
import type { Animator, StructureContext } from './context'

/** Pale gold of the Heart and its shrine. */
const HEART = '#ffd9a0'
const SHRINE_LIT = 1.3
const SHRINE_DARK = 0.2
/**
 * The Heart's light on the chamber plus a little skylight down the shaft (the baked terrain shadow darkens the pit).
 * Added in the chamber's own shaders: a real point light would cost every material in the scene.
 */
const CHAMBER_GLOW = /* glsl */ `
  vec3 uvHeart = uUndervaultHeart.xyz - vWorldPos;
  float uvD2 = dot(uvHeart, uvHeart);
  float uvFacing = 0.4 + 0.6 * max(dot(normalize(vWorldNormal), uvHeart * inversesqrt(uvD2 + 1e-3)), 0.0);
  vec3 uvHeartLight = vec3(1.0, 0.69, 0.35) * (uUndervaultHeart.w * uvFacing / (1.0 + uvD2 * 0.1));
  totalEmissiveRadiance += diffuseColor.rgb * (uvHeartLight + vec3(0.12, 0.14, 0.19));
`
/** Glow strength (`uUndervaultHeart.w`) while the Heart rests on the pedestal, and once it has been taken. */
const GLOW_LIT = 2.6
const GLOW_TAKEN = 0.5
/** Lining inside the vault walls, from the floor up to door level; its top is a ledge around the pit. */
const LINING = 0.9
const INNER = VAULT.halfWidth - LINING
/** Landing inside the door: local z from `edge` up to the door wall. */
const LANDING = { halfWidth: 3.2, edge: VAULT.halfDepth - 2.7 }
/** Local z where the slab through the door ends, out on the plateau. */
const SILL_END = VAULT.halfDepth + VAULT.wall + 0.6
/** The stair runs from the landing toward −z between stepped parapets (`rail` above each tread). */
const STAIR = { halfWidth: 2.2, tread: 0.45, riser: 0.3, parapet: 0.5, rail: 0.85 }
/** The shrine at the back: dais tiers (radius, top above the floor), the pedestal top, the Heart above it. */
const SHRINE_Z = -5.5
const DAIS = [
  { radius: 2.5, top: 0.3 },
  { radius: 1.7, top: 0.6 },
] as const
const PEDESTAL_TOP = 1.78
const KEY_LIFT = 0.75
/** Reactive crystal clusters on the chamber floor: local x, z, seed. */
const CRYSTALS = [
  [-6.7, -6.9, 71],
  [6.9, -6.6, 73],
  [6.8, 1.6, 79],
] as const

interface Materials {
  stone: THREE.Material
  floor: THREE.Material
  dark: THREE.Material
  /** Shrine glyphs and inlays; dims once the Heart is taken. */
  shrine: THREE.MeshStandardMaterial
}

/** Levels of the chamber, shared by the builder, the ghost's footing and the memory. */
interface Stair {
  /** Door threshold and landing level. */
  base: number
  /** Top of the slab through the door: a hair above the plateau along its whole length, so it never z-fights it. */
  sill: number
  floor: number
  riser: number
  steps: number
  /** Local z of the stair's foot. */
  foot: number
}

/** Box between local x0…x1 and z0…z1 (either order) from y0 to y1, plus its collider unless `visual`. */
type Solid = (
  material: THREE.Material,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y0: number,
  y1: number,
  visual?: boolean,
) => void

/** The Heart Key floating over its pedestal. */
export class HeartKey {
  private held = false
  private readonly restY: number

  constructor(
    /** World centre of the floating core (the pickup prompt measures from here). */
    readonly position: THREE.Vector3,
    private readonly root: THREE.Object3D,
    private readonly rings: readonly [THREE.Object3D, THREE.Object3D],
    private readonly shrine: THREE.MeshStandardMaterial,
    /** The chamber's `uUndervaultHeart` (w = glow strength). */
    private readonly glow: { value: THREE.Vector4 },
  ) {
    this.restY = root.position.y
  }

  get taken(): boolean {
    return this.held
  }

  /** Lifts the Heart off the pedestal (pickup, or on load when the save already holds it); the shrine goes dark. */
  take() {
    this.held = true
    this.root.visible = false
    this.shrine.emissiveIntensity = SHRINE_DARK
    this.glow.value.w = GLOW_TAKEN
  }

  readonly update: Animator = (dt, time) => {
    if (this.held) return
    this.glow.value.w = GLOW_LIT * (1 + 0.06 * Math.sin(time * 1.3))
    this.root.position.y = this.restY + Math.sin(time * 1.3) * 0.07
    this.root.rotation.y += dt * 0.5
    this.rings[0].rotation.x += dt * 0.9
    this.rings[1].rotation.y += dt * 1.4
  }
}

export interface Undervault {
  /** The Heart Key on its shrine. */
  readonly key: HeartKey
}

/**
 * The Undervault: a chamber sunk 6 m into the vault house (in the terrain hole, layout `UNDERVAULT_HOLE`). A landing
 * inside the door, a grand stair between stepped parapets, a lining whose top is a ledge at door level, and the Heart
 * Key's shrine at the back. Built in the vault's local frame (+z = door side); colliders get the same transform through
 * `vaultPoint`.
 */
export function buildUndervault(context: StructureContext): Undervault {
  const { scene, collision, reactives, animate } = context
  const base = collision.groundHeight(VAULT_THRESHOLD.x, VAULT_THRESHOLD.z)
  const floor = UNDERVAULT_FLOOR
  const risers = Math.max(2, Math.round((base - floor) / STAIR.riser))
  let sill = base
  for (const lz of [UNDERVAULT_HOLE.half + 0.05, SILL_END]) {
    for (const lx of [-STAIR.halfWidth, 0, STAIR.halfWidth]) {
      const p = vaultPoint(lx, lz)
      sill = Math.max(sill, collision.groundHeight(p.x, p.z))
    }
  }
  const stair: Stair = {
    base,
    sill: sill + 0.06,
    floor,
    riser: (base - floor) / risers,
    steps: risers - 1,
    foot: LANDING.edge - (risers - 1) * STAIR.tread,
  }
  const heartAt = vaultPoint(0, SHRINE_Z)
  const glow = { value: new THREE.Vector4(heartAt.x, floor + PEDESTAL_TOP + KEY_LIFT, heartAt.z, GLOW_LIT) }
  const lit: MaterialVariant = {
    key: 'undervault',
    uniforms: { uUndervaultHeart: glow },
    fragmentPars: 'uniform vec4 uUndervaultHeart;',
    emissive: CHAMBER_GLOW,
  }
  const m: Materials = {
    stone: createStoneMaterial('#746c66', lit),
    floor: createStoneMaterial('#5d5650', lit),
    dark: createMetalMaterial('#3a3f41', lit),
    shrine: createEnergyMaterial(HEART, SHRINE_LIT),
  }

  const group = new THREE.Group()
  group.name = 'undervault'
  group.position.set(UNDERVAULT.x, 0, UNDERVAULT.z)
  group.rotation.y = VAULT.yaw
  const batch = new Batch()
  const solid: Solid = (material, x0, x1, z0, z1, y0, y1, visual = false) => {
    const sx = Math.abs(x1 - x0)
    const sz = Math.abs(z1 - z0)
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    batch.add(material, block(sx, y1 - y0, sz), cx, y0, cz)
    if (visual) return
    const p = vaultPoint(cx, cz)
    collision.addBox(p.x, p.z, sx / 2, sz / 2, VAULT.yaw, y0, y1)
  }
  buildChamber(solid, batch, m, stair)
  buildShrine(collision, batch, m, floor)
  batch.build(group, 'undervault.chamber', m.shrine)
  const key = buildHeart(group, m.shrine, floor, glow)
  animate(key.update)
  scene.add(group)

  for (const [lx, lz, seed] of CRYSTALS) {
    const p = vaultPoint(lx, lz)
    reactives.add(new CrystalCluster(scene, collision, { x: p.x, z: p.z, count: 5, spread: 1.2, seed, size: 0.75, baseY: floor }))
  }
  buildUndervaultEchoes(context, stair)
  return { key }
}

/** Floor slab, lining with its ledge, landing, threshold, the stair and its parapets, glyph bands. */
function buildChamber(solid: Solid, batch: Batch, m: Materials, { base, sill, floor, riser, steps }: Stair) {
  const { halfWidth, halfDepth, wall } = VAULT
  const below = floor - 1
  solid(m.floor, -halfWidth, halfWidth, -halfDepth, halfDepth, below, floor)
  solid(m.stone, -halfWidth, halfWidth, -halfDepth, -INNER, below, base)
  for (const side of [-1, 1]) {
    solid(m.stone, side * INNER, side * halfWidth, -INNER, INNER, below, base)
    solid(m.stone, side * LANDING.halfWidth, side * halfWidth, INNER, halfDepth, below, base)
  }
  solid(m.stone, -LANDING.halfWidth, LANDING.halfWidth, LANDING.edge, halfDepth, below, base)
  // Through the door gap and over the terrain hole's edge: walkable once the door has sunk into it.
  solid(m.floor, -STAIR.halfWidth, STAIR.halfWidth, halfDepth, SILL_END, below, sill)

  for (let i = 1; i <= steps; i++) {
    const top = base - i * riser
    const z1 = LANDING.edge - (i - 1) * STAIR.tread
    const z0 = z1 - STAIR.tread
    solid(m.stone, -STAIR.halfWidth, STAIR.halfWidth, z0, z1, below, top)
    batch.add(m.dark, new THREE.BoxGeometry(STAIR.halfWidth * 2, 0.06, 0.12), 0, top, z0 + 0.06)
    for (const side of [-1, 1]) {
      solid(m.stone, side * STAIR.halfWidth, side * (STAIR.halfWidth + STAIR.parapet), z0, z1, below, top + STAIR.rail)
    }
  }

  // Sloped coping over the stepped parapets (its underside runs through their upper corners), newels at both ends.
  const foot = LANDING.edge - steps * STAIR.tread
  const lineTop = base - riser + STAIR.rail
  const lineFoot = floor + STAIR.rail
  const run = LANDING.edge - foot
  const slope = Math.atan2(lineTop - lineFoot, run)
  const coping = 0.36 / Math.cos(slope)
  const railX = STAIR.halfWidth + STAIR.parapet / 2
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(STAIR.parapet + 0.08, 0.36, Math.hypot(run, lineTop - lineFoot)).rotateX(-slope)
    batch.add(m.dark, rail, side * railX, (lineTop + lineFoot) / 2 + coping / 2, (LANDING.edge + foot) / 2)
    solid(m.stone, side * (railX - 0.38), side * (railX + 0.38), LANDING.edge, LANDING.edge + 0.76, below, base + 1.4)
    solid(m.stone, side * (railX - 0.38), side * (railX + 0.38), foot - 0.76, foot, below, floor + 1.4)
  }

  // Dark coping along the ledge's inner edge (visual lip) and a glyph band around the chamber.
  const ledge = INNER - LANDING.halfWidth
  batch.add(m.dark, block(INNER * 2 + 0.48, 0.1, 0.24), 0, base, -INNER - 0.12)
  const bandY = floor + 2.1
  batch.add(m.shrine, new THREE.BoxGeometry(INNER * 2, 0.07, 0.04), 0, bandY, -INNER + 0.02)
  for (const side of [-1, 1]) {
    batch.add(m.dark, block(0.24, 0.1, INNER * 2), side * (INNER + 0.12), base, 0)
    batch.add(m.dark, block(ledge, 0.1, 0.24), (side * (INNER + LANDING.halfWidth)) / 2, base, INNER + 0.12)
    batch.add(m.shrine, new THREE.BoxGeometry(0.04, 0.07, INNER * 2), side * (INNER - 0.02), bandY, 0)
    batch.add(m.shrine, new THREE.BoxGeometry(ledge, 0.07, 0.04), (side * (INNER + LANDING.halfWidth)) / 2, bandY, INNER - 0.02)
  }
}

/** Two-tier dais with the pedestal, flanking obelisks, the floor ring and the Heart sigil on the back wall. */
function buildShrine(collision: Collision, batch: Batch, m: Materials, floor: number) {
  const at = vaultPoint(0, SHRINE_Z)
  const below = floor - 1
  for (const tier of DAIS) {
    const height = tier.top + 1
    batch.add(m.stone, new THREE.CylinderGeometry(tier.radius, tier.radius + 0.1, height, 8), 0, below + height / 2, SHRINE_Z, {
      y: Math.PI / 8,
    })
    collision.addCylinder(at.x, at.z, tier.radius - 0.1, below, floor + tier.top)
  }
  const step = floor + DAIS[1].top
  const column = PEDESTAL_TOP - DAIS[1].top - 0.18
  batch.add(m.stone, new THREE.CylinderGeometry(0.36, 0.5, column, 8), 0, step + column / 2, SHRINE_Z, { y: Math.PI / 8 })
  batch.add(m.dark, new THREE.CylinderGeometry(0.62, 0.42, 0.18, 8), 0, floor + PEDESTAL_TOP - 0.09, SHRINE_Z, { y: Math.PI / 8 })
  batch.add(m.shrine, new THREE.TorusGeometry(0.44, 0.04, 4, 32).rotateX(Math.PI / 2), 0, floor + PEDESTAL_TOP + 0.01, SHRINE_Z)
  collision.addCylinder(at.x, at.z, 0.55, floor, floor + PEDESTAL_TOP)
  batch.add(m.shrine, new THREE.TorusGeometry(2.9, 0.05, 4, 56).rotateX(Math.PI / 2), 0, floor + 0.01, SHRINE_Z)

  for (const side of [-1, 1]) {
    const x = side * 4.3
    const z = SHRINE_Z + 0.4
    batch.add(m.stone, block(0.7, 3.1, 0.7), x, floor, z)
    batch.add(m.dark, new THREE.ConeGeometry(0.52, 0.6, 4).rotateY(Math.PI / 4), x, floor + 3.4, z)
    batch.add(m.shrine, new THREE.BoxGeometry(0.04, 2.2, 0.1), x - side * 0.37, floor + 1.7, z)
    const p = vaultPoint(x, z)
    collision.addBox(p.x, p.z, 0.36, 0.36, VAULT.yaw, floor, floor + 3.7)
  }

  const sigil: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1.35, 0.06, 4, 48), new THREE.TorusGeometry(0.55, 0.05, 4, 32)]
  for (let i = 0; i < 6; i++) {
    sigil.push(new THREE.BoxGeometry(0.06, 0.62, 0.04).translate(0, 0.95, 0).rotateZ((i * Math.PI) / 3))
  }
  batch.add(m.shrine, mergeParts(sigil, 'undervault.sigil'), 0, floor + 3.9, -INNER + 0.04)
}

/** The Heart Key: a gold core inside two tumbling rings, floating over the pedestal. */
function buildHeart(
  group: THREE.Group,
  shrine: THREE.MeshStandardMaterial,
  floor: number,
  glow: { value: THREE.Vector4 },
): HeartKey {
  const material = createEnergyMaterial(HEART, 3.4)
  const y = floor + PEDESTAL_TOP + KEY_LIFT
  const root = new THREE.Group()
  root.name = 'undervault.heart'
  root.position.set(0, y, SHRINE_Z)
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0).scale(1, 1.45, 1), material)
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.026, 6, 48), material)
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.02, 6, 40), material)
  inner.rotation.y = Math.PI / 2
  root.add(core, outer, inner)
  group.add(root)
  const at = vaultPoint(0, SHRINE_Z)
  return new HeartKey(new THREE.Vector3(at.x, y, at.z), root, [outer, inner], shrine, glow)
}

/**
 * Memory: the chamber hidden under a floor at door level (stair opening, oculus over the Heart), the reliquary cage
 * around the Heart, and the Dissenter carrying it down the stair to the pedestal.
 */
function buildUndervaultEchoes({ scene, reactives }: StructureContext, { base, floor, riser, foot }: Stair) {
  // Shape y = −local z: the extrusion is turned to lie flat below.
  const outline = new THREE.Shape().moveTo(-INNER, -INNER).lineTo(INNER, -INNER).lineTo(INNER, INNER).lineTo(-INNER, INNER)
  outline.closePath()
  const half = STAIR.halfWidth + STAIR.parapet
  const opening = new THREE.Path().moveTo(-half, -LANDING.edge).lineTo(half, -LANDING.edge).lineTo(half, -foot).lineTo(-half, -foot)
  opening.closePath()
  const oculus = new THREE.Path()
  oculus.absarc(0, -SHRINE_Z, 1.8, 0, Math.PI * 2, true)
  outline.holes.push(opening, oculus)
  const cover = new THREE.ExtrudeGeometry(outline, { depth: 0.45, bevelEnabled: false, curveSegments: 20 })
    .rotateX(-Math.PI / 2)
    .translate(0, base - 0.45, 0)

  const step = floor + DAIS[1].top
  const cageTop = step + 3.6
  const cage: THREE.BufferGeometry[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    cage.push(new THREE.BoxGeometry(0.1, 3.6, 0.1).translate(Math.cos(a) * 1.3, step + 1.8, SHRINE_Z + Math.sin(a) * 1.3))
  }
  for (const y of [step + 0.1, cageTop]) {
    cage.push(new THREE.TorusGeometry(1.3, 0.06, 4, 40).rotateX(Math.PI / 2).translate(0, y, SHRINE_Z))
  }
  cage.push(new THREE.SphereGeometry(1.3, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, cageTop, SHRINE_Z))

  const past = new THREE.Group()
  past.name = 'undervault.past'
  past.position.set(UNDERVAULT.x, 0, UNDERVAULT.z)
  past.rotation.y = VAULT.yaw
  past.add(new THREE.Mesh(cover), new THREE.Mesh(mergeParts(cage, 'undervault.cage')))
  reactives.add(new PastStateOverlay(scene, past))

  const at = (lx: number, lz: number): Point2 => {
    const p = vaultPoint(lx, lz)
    return [p.x, p.z]
  }
  const local = { x: 0, z: 0 }
  const heightAt = (x: number, z: number) => {
    const p = vaultLocal(x, z, local)
    if (Math.abs(p.x) <= LANDING.halfWidth && p.z >= LANDING.edge) return base
    if (Math.abs(p.x) <= STAIR.halfWidth && p.z > foot) return base - Math.ceil((LANDING.edge - p.z) / STAIR.tread) * riser
    const d = Math.hypot(p.x, p.z - SHRINE_Z)
    if (d < DAIS[1].radius) return floor + DAIS[1].top
    if (d < DAIS[0].radius) return floor + DAIS[0].top
    return floor
  }
  reactives.add(
    new GhostScene(
      scene,
      [
        {
          path: [at(0, LANDING.edge + 0.6), at(0, foot - 0.3), at(0, SHRINE_Z + 1.2)],
          speed: 1.5,
          endPose: 'reach',
          lookAt: at(0, SHRINE_Z),
        },
      ],
      heightAt,
      'undervault.dissenter',
    ),
  )
}
