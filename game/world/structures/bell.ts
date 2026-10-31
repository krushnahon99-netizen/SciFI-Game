import * as THREE from 'three'
import { PastStateOverlay } from '../../echo/pastState'
import { Batch, block } from '../geometry'
import { DROWNED_BELL } from '../layout'
import { createEnergyMaterial, createMetalMaterial, createStoneMaterial } from '../materials'
import type { StructureContext } from './context'

const GLOW = '#56e6ff'
/** Outer profile up to the crown, then the inner one back down (radius, height; lip at y 0): a lathe of a thick shell. */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [3.0, 0], [2.96, 0.35], [2.62, 0.8], [2.22, 1.7], [2.02, 2.8], [1.92, 3.8], [1.76, 4.5], [1.36, 5.0], [0.62, 5.26],
  [0.01, 5.3], [0.01, 4.98], [0.55, 4.94], [1.2, 4.66], [1.55, 4.2], [1.68, 3.6], [1.78, 2.7], [1.98, 1.7], [2.36, 0.85],
  [2.7, 0.36], [2.74, 0], [3.0, 0],
]
/** Glyph bands hugging the outer surface: height and radius there. */
const BANDS = [
  { y: 1.25, radius: 2.44 },
  { y: 3.9, radius: 1.92 },
]
/** The bell lies on its side in the crater floor: tilt from upright, heading of the tilt, lip edge sunk this deep. */
const TILT = 1.05
const SPIN = 0.6
const SINK = 1.4

/** A bell part in bell space (lip centre at the origin, crown up +y), then laid over and turned like the bell. */
function laid(geometry: THREE.BufferGeometry, y = 0) {
  return geometry.translate(0, y, 0).rotateZ(TILT).rotateY(SPIN)
}

/** Bell-space axis point at height `h` → world xz offset from the lip centre. */
function axisOffset(h: number) {
  const x = -Math.sin(TILT) * h
  return { x: x * Math.cos(SPIN), z: -x * Math.sin(SPIN) }
}

/**
 * The Drowned Bell (secret): a great bell lying half-sunk on its side at the bottom of the crater, two glyph bands round
 * its waist, its broken yoke beside it. A pulse in the crater finds the secret (gameplay/secrets.ts) and shows the bell
 * tower as it stood, the bell hanging between two pylons.
 */
export function buildDrownedBell(context: StructureContext) {
  const { scene, collision, reactives } = context
  const floor = collision.groundHeight(DROWNED_BELL.x, DROWNED_BELL.z)
  const bronze = createMetalMaterial('#7a6a4c')
  const stone = createStoneMaterial('#6d625c')
  const glyph = createEnergyMaterial(GLOW, 1.1)
  const batch = new Batch()

  // Centre the lying bell on the crater (the lip centre sits back along the axis from the middle of its length) and
  // raise it so the lowest lip edge (3 m lip radius, tilted) is sunk SINK into the floor.
  const middle = axisOffset(2.6)
  const lip = { x: DROWNED_BELL.x - middle.x, y: floor - SINK + 3 * Math.sin(TILT), z: DROWNED_BELL.z - middle.z }
  const shell = new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 40)
  batch.add(bronze, laid(shell), lip.x, lip.y, lip.z)
  batch.add(bronze, laid(new THREE.TorusGeometry(0.7, 0.22, 8, 18), 5.8), lip.x, lip.y, lip.z)
  for (const band of BANDS) {
    batch.add(glyph, laid(new THREE.TorusGeometry(band.radius, 0.06, 4, 56).rotateX(Math.PI / 2), band.y), lip.x, lip.y, lip.z)
  }
  // Clapper fallen out of the mouth, and the snapped yoke half-buried beside the bell.
  const mouth = { x: Math.sin(SPIN + Math.PI / 2) * 3.4, z: Math.cos(SPIN + Math.PI / 2) * 3.4 }
  batch.add(bronze, new THREE.SphereGeometry(0.75, 14, 10), lip.x + mouth.x, floor + 0.35, lip.z + mouth.z)
  const yokeAngle = SPIN + 1.25
  batch.add(stone, block(1.1, 1.1, 11), DROWNED_BELL.x + Math.cos(yokeAngle) * 4.5, floor - 0.55, DROWNED_BELL.z - Math.sin(yokeAngle) * 4.5, {
    y: yokeAngle,
    x: 0.08,
  })
  batch.build(scene, 'drownedBell', glyph)

  for (const [h, radius] of [
    [1.2, 2.4],
    [3.6, 1.9],
  ] as const) {
    const offset = axisOffset(h)
    const top = lip.y + h * Math.cos(TILT) + radius * Math.sin(TILT) - 0.6
    collision.addCylinder(lip.x + offset.x, lip.z + offset.z, radius, floor - 2, top)
  }

  reactives.add(new PastStateOverlay(scene, buildTowerPast(floor)))
}

/** The bell tower as it stood (hologram): two tapered pylons, the yoke across their tops, the bell hanging between. */
function buildTowerPast(floor: number): THREE.Group {
  const root = new THREE.Group()
  root.name = 'drownedBell.past'
  root.position.set(DROWNED_BELL.x, floor, DROWNED_BELL.z)
  root.rotation.y = SPIN
  for (const side of [-1, 1]) {
    const pylon = new THREE.Mesh(block(1.8, 16, 1.8, 0.75))
    pylon.position.set(side * 5.6, 0, 0)
    root.add(pylon)
  }
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 1.3))
  yoke.position.set(0, 15.6, 0)
  const bell = new THREE.Mesh(new THREE.LatheGeometry(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 32))
  bell.position.set(0, 9.4, 0)
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.22, 8, 18))
  loop.position.set(0, 15.2, 0)
  root.add(yoke, bell, loop)
  return root
}
