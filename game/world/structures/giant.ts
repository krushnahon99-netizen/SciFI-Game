import * as THREE from 'three'
import { PastStateOverlay } from '../../echo/pastState'
import { RevealTimer, type PulseInfo, type Reactive } from '../../echo/reactive'
import { Batch } from '../geometry'
import { PLANET_DIRECTION, SLEEPING_GIANT } from '../layout'
import { createEnergyMaterial, createStoneMaterial } from '../materials'
import type { StructureContext } from './context'

const GLOW = '#56e6ff'
/** The giant faces the ringed planet: local +z points at its azimuth. */
const YAW = Math.atan2(PLANET_DIRECTION.x, PLANET_DIRECTION.z)
/** Head centre (local, metres above the ground) and its upward tilt toward the planet. */
const HEAD = { y: 3.4, z: -1, tilt: -0.22, rx: 3.3, ry: 4.3, rz: 3.6 }
/** Upturned palm in front of the giant, offered toward the planet. */
const PALM = { x: 7.9, y: 0.75, z: 9.8 }
/** The memory shows this long after the wavefront reaches the giant. */
const MEMORY = { hold: 12, fadeIn: 1.2, fadeOut: 2.5 }
/** Above this reveal amount the giant can be inspected (gameplay/secrets.ts). */
const AWAKE_AT = 0.3
const X_AXIS = new THREE.Vector3(1, 0, 0)
const UP = new THREE.Vector3(0, 1, 0)

export interface SleepingGiant {
  /** Centre of the upturned palm; the Inspect prompt measures from here. */
  readonly palm: THREE.Vector3
  /** True while a pulse's memory of the giant is showing (its eyes and palm sigil are lit). */
  readonly awake: boolean
}

type Rotation = { x?: number; y?: number; z?: number }

/** Unit sphere scaled into an ellipsoid. */
const ellipsoid = (x: number, y: number, z: number, detail = 1) =>
  new THREE.SphereGeometry(1, Math.round(16 * detail), Math.round(10 * detail)).scale(x, y, z)

/** Local giant frame (+z toward the planet) → world xz. */
function toWorld(lx: number, lz: number) {
  const c = Math.cos(YAW)
  const s = Math.sin(YAW)
  return { x: SLEEPING_GIANT.x + lx * c + lz * s, z: SLEEPING_GIANT.z - lx * s + lz * c }
}

/** Depth of the head's surface in front of its centre at head-frame (x, y): where face details sit. */
function faceZ(x: number, y: number) {
  return HEAD.rz * Math.sqrt(Math.max(0, 1 - (x / HEAD.rx) ** 2 - (y / HEAD.ry) ** 2))
}

/** A pulse wakes the giant's memory for a while: its eyes and palm sigil light up and it can be inspected. */
class GiantMemory implements Reactive {
  readonly kind = 'trigger' as const
  readonly radius = 16
  awake = false
  private readonly timer = new RevealTimer(MEMORY.hold, MEMORY.fadeIn, MEMORY.fadeOut)

  constructor(
    readonly center: THREE.Vector3,
    private readonly glow: THREE.MeshStandardMaterial,
  ) {}

  hit(_pulse: PulseInfo, arrival: number) {
    this.timer.trigger(arrival)
  }

  update(clock: number): boolean {
    const amount = this.timer.amount(clock)
    const done = this.timer.done(clock)
    this.awake = !done && amount > AWAKE_AT
    this.glow.emissiveIntensity = done ? 0 : amount * 3.2
    return !done
  }
}

/**
 * The Sleeping Giant (secret): a colossal stone head buried to the collarbones in the western dunes, eyes closed, face
 * lifted to the ringed planet, one hand breaking the sand palm-up in front of it. A pulse wakes its memory: the eyes
 * and palm sigil light and a hologram shows the giant as it once stood, arms raised to the planet. Inspecting the palm
 * while it is awake finds the secret (gameplay/secrets.ts).
 */
export function buildGiant(context: StructureContext): SleepingGiant {
  const { scene, collision, reactives } = context
  const centre = toWorld(0, HEAD.z)
  const ground = collision.groundHeight(centre.x, centre.z)
  const stone = createStoneMaterial('#8f8173')
  const dark = createStoneMaterial('#5d5450')
  const glyph = createEnergyMaterial(GLOW, 0.8)
  const wake = createEnergyMaterial(GLOW, 0)
  const batch = new Batch()

  /** Adds a part at local (lx, ly, lz); `rooted` parts stand on the terrain under them instead of the head's ground. */
  const put = (
    material: THREE.Material,
    geometry: THREE.BufferGeometry,
    lx: number,
    ly: number,
    lz: number,
    rotation: Rotation = {},
    rooted = false,
  ) => {
    if (rotation.z) geometry.rotateZ(rotation.z)
    if (rotation.y) geometry.rotateY(rotation.y)
    if (rotation.x) geometry.rotateX(rotation.x)
    geometry.rotateY(YAW)
    const p = toWorld(lx, lz)
    batch.add(material, geometry, p.x, (rooted ? collision.groundHeight(p.x, p.z) : ground) + ly, p.z)
  }
  /** Adds a part at head-frame offset (hx, hy, hz); the whole head tilts up toward the planet. */
  const headPart = (material: THREE.Material, geometry: THREE.BufferGeometry, hx: number, hy: number, hz: number, rotation: Rotation = {}) => {
    if (rotation.z) geometry.rotateZ(rotation.z)
    if (rotation.y) geometry.rotateY(rotation.y)
    if (rotation.x) geometry.rotateX(rotation.x)
    const offset = new THREE.Vector3(hx, hy, hz).applyAxisAngle(X_AXIS, HEAD.tilt)
    put(material, geometry, offset.x, HEAD.y + offset.y, HEAD.z + offset.z, { x: HEAD.tilt })
  }

  // Head: skull, ears, brows over closed eyes, nose, lips, chin, glyph tears, a spiked circlet with a glyph band.
  headPart(stone, ellipsoid(HEAD.rx, HEAD.ry, HEAD.rz, 1.5), 0, 0, 0)
  for (const side of [-1, 1]) {
    headPart(stone, ellipsoid(0.45, 1.3, 0.85), side * 3.2, 0.1, 0.2)
    headPart(stone, ellipsoid(1.4, 0.5, 0.65), side * 1.3, 1.15, faceZ(1.3, 1.15) - 0.2, { y: side * 0.4 })
    headPart(wake, ellipsoid(0.85, 0.09, 0.3), side * 1.3, 0.45, faceZ(1.3, 0.45) - 0.06, { y: side * 0.4 })
    headPart(glyph, ellipsoid(0.07, 0.9, 0.08), side * 1.55, -0.65, faceZ(1.55, -0.65) - 0.02, { y: side * 0.45 })
  }
  headPart(stone, ellipsoid(0.62, 1.45, 0.8), 0, -0.4, faceZ(0, -0.4) - 0.1)
  headPart(dark, ellipsoid(1.15, 0.26, 0.42), 0, -2.2, faceZ(0, -2.2) - 0.15)
  headPart(stone, ellipsoid(1.3, 0.9, 1.0), 0, -3.1, faceZ(0, -3.1) - 0.4)
  const bandY = 2.2
  const bandScale = Math.sqrt(1 - (bandY / HEAD.ry) ** 2)
  const bandX = HEAD.rx * bandScale
  const bandZ = HEAD.rz * bandScale
  headPart(dark, new THREE.TorusGeometry(bandX + 0.02, 0.32, 6, 40).rotateX(Math.PI / 2).scale(1, 1, bandZ / bandX), 0, bandY, 0)
  headPart(glyph, new THREE.TorusGeometry(bandX + 0.33, 0.05, 4, 48).rotateX(Math.PI / 2).scale(1, 1, bandZ / bandX), 0, bandY, 0)
  const spikes = [1.2, 1.9, 2.6, 0.7, 1.2]
  spikes.forEach((height, i) => {
    const angle = Math.PI / 2 + (i - 2) * 0.45
    headPart(dark, new THREE.ConeGeometry(0.42, height, 5), Math.cos(angle) * bandX, bandY + 0.25 + height / 2, Math.sin(angle) * bandZ)
  })

  // Collar and shoulders breaking the sand, and the chest's low ridge in front.
  put(stone, ellipsoid(3.4, 1.4, 3.2), 0, -0.3, -1.6)
  for (const side of [-1, 1]) put(stone, ellipsoid(4.8, 2.6, 3.8, 1.2), side * 6.4, 0.2, -2.2, { z: -side * 0.22 }, true)
  put(stone, ellipsoid(5.2, 1.1, 2.8), 0, -0.45, 2.2)

  // The offered hand: forearm, palm with a sigil, four fingers curled up at its far edge, the thumb out to the side.
  put(stone, ellipsoid(1.5, 1.2, 3.6), 7.2, -0.2, 6.6, { x: -0.15, y: 0.18 }, true)
  put(stone, ellipsoid(2.0, 0.75, 2.2), PALM.x, PALM.y, PALM.z, {}, true)
  put(wake, new THREE.TorusGeometry(0.8, 0.06, 4, 28).rotateX(Math.PI / 2), PALM.x, PALM.y + 0.73, PALM.z, {}, true)
  const fingers = [1.15, 1.5, 1.6, 1.3]
  fingers.forEach((length, i) => {
    put(stone, ellipsoid(0.46, length, 0.5), PALM.x + (i - 1.5) * 0.95, PALM.y + length * 0.6, PALM.z + 1.6, { x: -0.35 }, true)
  })
  put(stone, ellipsoid(0.55, 1.3, 0.55), PALM.x + 2.1, PALM.y + 0.5, PALM.z - 0.2, { z: -0.7 }, true)
  batch.build(scene, 'giant', glyph, wake)

  const head = toWorld(0, HEAD.z)
  collision.addCylinder(head.x, head.z, HEAD.rx - 0.3, ground - 1, ground + HEAD.y + HEAD.ry * 0.95)
  collision.addCylinder(centre.x, centre.z, 3.4, ground - 1, ground + 1)
  for (const side of [-1, 1]) {
    const p = toWorld(side * 6.4, -2.2)
    const base = collision.groundHeight(p.x, p.z)
    collision.addCylinder(p.x, p.z, 3.7, base - 1, base + 2.6)
  }
  const chest = toWorld(0, 2.2)
  collision.addCylinder(chest.x, chest.z, 2.6, ground - 1, ground + 0.6)
  for (const lz of [4.5, 7.5]) {
    const p = toWorld(7.2 + (lz - 6.6) * 0.18, lz)
    const base = collision.groundHeight(p.x, p.z)
    collision.addCylinder(p.x, p.z, 1.3, base - 1, base + 0.9)
  }
  const palmXZ = toWorld(PALM.x, PALM.z)
  const palmBase = collision.groundHeight(palmXZ.x, palmXZ.z)
  collision.addCylinder(palmXZ.x, palmXZ.z, 1.9, palmBase - 1, palmBase + PALM.y + 0.6)

  const memory = reactives.add(new GiantMemory(new THREE.Vector3(head.x, ground + HEAD.y, head.z), wake))
  reactives.add(new PastStateOverlay(scene, buildGiantPast(ground)))

  const palm = new THREE.Vector3(palmXZ.x, palmBase + PALM.y + 0.8, palmXZ.z)
  return {
    palm,
    get awake() {
      return memory.awake
    },
  }
}

/** The giant as it once stood (hologram): a robed colossus with both arms raised, holding a small light up to the planet. */
function buildGiantPast(ground: number): THREE.Group {
  const root = new THREE.Group()
  root.name = 'giant.past'
  const site = toWorld(0, -1.5)
  root.position.set(site.x, ground, site.z)
  root.rotation.y = YAW
  const add = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry)
    mesh.position.set(x, y, z)
    root.add(mesh)
    return mesh
  }
  for (const side of [-1, 1]) add(new THREE.CylinderGeometry(1.5, 1.9, 15, 10), side * 2.4, 7.5, 0)
  add(new THREE.CylinderGeometry(3.6, 4.8, 6, 14), 0, 15, 0)
  add(new THREE.CylinderGeometry(4.3, 3.5, 10, 14), 0, 22.5, 0)
  add(ellipsoid(6.2, 1.8, 2.8), 0, 27.2, 0)
  add(ellipsoid(2.3, 2.9, 2.5), 0, 31.4, 0.6).rotation.x = -0.3
  add(new THREE.TorusGeometry(2.1, 0.25, 6, 28).rotateX(Math.PI / 2), 0, 33, 0.4)
  const reach = new THREE.Vector3()
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * 5.4, 26.6, 0)
    const direction = new THREE.Vector3(side * 0.14, 0.76, 0.64).normalize()
    reach.copy(shoulder).addScaledVector(direction, 7)
    add(new THREE.CylinderGeometry(0.7, 1.0, 14, 10), reach.x, reach.y, reach.z).quaternion.setFromUnitVectors(UP, direction)
    reach.copy(shoulder).addScaledVector(direction, 14.6)
    add(ellipsoid(0.8, 1.3, 0.65), reach.x, reach.y, reach.z).quaternion.setFromUnitVectors(UP, direction)
  }
  add(new THREE.SphereGeometry(1.7, 20, 14), 0, reach.y + 1.6, reach.z + 0.6)
  return root
}
