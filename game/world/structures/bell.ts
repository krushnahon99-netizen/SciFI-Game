import * as THREE from 'three'
import { PulseGlow } from '../../echo/glow'
import { PastStateOverlay } from '../../echo/pastState'
import { Batch, block, mergeParts } from '../geometry'
import { DROWNED_BELL } from '../layout'
import { createEnergyMaterial, createMetalMaterial, createStoneMaterial } from '../materials'
import type { StructureContext } from './context'

/** Where the bell lies (a little off the crater's centre), its lean and the lean's heading, and how deep it sank. */
const BELL = { x: DROWNED_BELL.x - 2.5, z: DROWNED_BELL.z + 1.5, tilt: 0.38, heading: 0.9, sink: 1.15 }
/** Its fallen frame: posts `spread` m either side of the bell along `yaw`; intact (past state) it stood `height` m. */
const FRAME = { spread: 4.6, yaw: 0.4, height: 9.6, post: 1.1 }
/** Bell cross-section (radius, height): the outer face from the lip up to the crown, then the inner face back down. */
const PROFILE: readonly (readonly [number, number])[] = [
  [2.6, 0], [2.64, 0.2], [2.45, 0.55], [2.12, 1.1], [1.82, 1.85], [1.64, 2.7], [1.56, 3.5], [1.46, 4.05],
  [1.2, 4.48], [0.7, 4.74], [0.02, 4.8], [0.02, 4.42], [0.62, 4.38], [1.12, 4.08], [1.3, 3.5], [1.38, 2.7],
  [1.55, 1.85], [1.86, 1.1], [2.2, 0.5], [2.4, 0.12], [2.6, 0],
]
/** Glyph bands (radius, height) on the outer face. */
const BANDS: readonly (readonly [number, number])[] = [
  [2.45, 0.55],
  [1.64, 2.7],
]
/** A pulse makes the bands ring out: a quick flare and a long decay. */
const RING = { rest: 0.45, peak: 6, hold: 2.5, fadeIn: 0.15, fadeOut: 6 }

function bellGeometry(): THREE.BufferGeometry {
  return mergeParts(
    [
      new THREE.LatheGeometry(
        PROFILE.map(([r, y]) => new THREE.Vector2(r, y)),
        48,
      ),
      new THREE.CylinderGeometry(0.55, 0.8, 0.32, 20).translate(0, 4.9, 0),
      new THREE.TorusGeometry(0.5, 0.17, 8, 24).translate(0, 5.2, 0),
    ],
    'bell',
  )
}

/**
 * The Drowned Bell (secret): a great bronze bell lying tilted and half-sunk in the bottom of the old lake crater, the
 * stone frame it hung from fallen around it. A pulse makes its glyph bands ring out and shows it hanging in the
 * intact frame. Discovery (a pulse inside the crater) is in gameplay/secrets.ts.
 */
export function buildDrownedBell({ scene, collision, reactives }: StructureContext) {
  const ground = collision.groundHeight(BELL.x, BELL.z)
  const bronze = createMetalMaterial('#5c6a50')
  bronze.side = THREE.DoubleSide
  const glow = createEnergyMaterial('#9ff0ff', RING.rest)

  const bell = new THREE.Group()
  bell.name = 'bell'
  bell.position.set(BELL.x, ground - BELL.sink, BELL.z)
  bell.rotation.set(BELL.tilt, BELL.heading, 0, 'YXZ')
  const body = new THREE.Mesh(bellGeometry(), bronze)
  body.castShadow = true
  body.receiveShadow = true
  const bands = new THREE.Mesh(
    mergeParts(
      BANDS.map(([r, y]) => new THREE.TorusGeometry(r + 0.04, 0.07, 6, 72).rotateX(Math.PI / 2).translate(0, y, 0)),
      'bell.bands',
    ),
    glow,
  )
  bell.add(body, bands)
  scene.add(bell)
  collision.addCylinder(BELL.x, BELL.z, 2.4, ground - 2, ground + 3.2)

  // The fallen frame: one post still standing (snapped), a stub, its broken top and the crossbeam in two pieces.
  const stone = createStoneMaterial('#7a6e64')
  const ruins = new Batch()
  const dx = Math.cos(FRAME.yaw) * FRAME.spread
  const dz = -Math.sin(FRAME.yaw) * FRAME.spread
  const post = (x: number, z: number, height: number, lean: number) => {
    const g = collision.groundHeight(x, z)
    ruins.add(stone, block(FRAME.post, height, FRAME.post, 0.94), x, g - 0.4, z, { z: lean, y: FRAME.yaw })
    collision.addBox(x, z, FRAME.post / 2, FRAME.post / 2, FRAME.yaw, g - 1, g + height - 0.4)
  }
  /** A block lying on the floor, from (x, z) along its own -x for `length` m. */
  const lying = (x: number, z: number, length: number, size: number, yaw: number) => {
    const g = collision.groundHeight(x, z)
    ruins.add(stone, block(size, length, size), x, g + size / 2 - 0.25, z, { z: Math.PI / 2, y: yaw })
    const cx = x - (length / 2) * Math.cos(yaw)
    const cz = z + (length / 2) * Math.sin(yaw)
    collision.addBox(cx, cz, length / 2, size / 2, yaw, g - 0.5, g + size - 0.25)
  }
  post(BELL.x + dx, BELL.z + dz, 6.3, 0.05)
  post(BELL.x - dx, BELL.z - dz, 1.7, 0)
  const px = Math.sin(FRAME.yaw)
  const pz = Math.cos(FRAME.yaw)
  lying(BELL.x - dx * 1.25 + px * 0.9, BELL.z - dz * 1.25 + pz * 0.9, 5.2, FRAME.post, FRAME.yaw)
  lying(BELL.x + px * 3.6 + dx * 0.4, BELL.z + pz * 3.6 + dz * 0.4, 4.6, 1, FRAME.yaw + 1.2)
  lying(BELL.x - px * 3.8 + dx * 0.6, BELL.z - pz * 3.8 + dz * 0.6, 4.2, 1, FRAME.yaw - 0.5)
  ruins.build(scene, 'bell.frame')

  // Echoes: the bands ring out, and the bell hangs in its intact frame again.
  reactives.add(new PulseGlow(new THREE.Vector3(BELL.x, ground + 1.2, BELL.z), 3, [glow], RING))
  const hanging: THREE.BufferGeometry[] = []
  for (const s of [1, -1]) {
    hanging.push(
      block(FRAME.post, FRAME.height, FRAME.post)
        .rotateY(FRAME.yaw)
        .translate(BELL.x + s * dx, ground - 0.3, BELL.z + s * dz),
    )
  }
  hanging.push(
    new THREE.BoxGeometry(FRAME.spread * 2 + 2.2, 0.9, 1)
      .rotateY(FRAME.yaw)
      .translate(BELL.x, ground + FRAME.height - 0.75, BELL.z),
  )
  hanging.push(bellGeometry().translate(BELL.x, ground + FRAME.height - 1.2 - 5.37, BELL.z))
  const past = new THREE.Group()
  past.name = 'bell.past'
  past.add(new THREE.Mesh(mergeParts(hanging, 'bell.past')))
  reactives.add(new PastStateOverlay(scene, past))
}
