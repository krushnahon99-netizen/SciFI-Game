import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { CrystalCluster } from '../../echo/crystals'
import { GhostScene } from '../../echo/ghosts'
import { GlyphTrail } from '../../echo/glyphs'
import { PastStateOverlay } from '../../echo/pastState'
import { PhaseObject, type PhasePart } from '../../echo/phase'
import type { Collision } from '../../physics/collision'
import { GHOST_GARDEN, MONOLITH, type Point2 } from '../layout'
import { createEnergyMaterial, createStoneMaterial } from '../materials'
import { mulberry32 } from '../noise'
import type { StructureContext } from './context'

/** The slab as it once stood (shown by the past-state hologram); the present halves are cut from the same block. */
const SLAB = { width: 5.2, height: 30, depth: 2.9, yaw: 0.35 }
/** Centre of the slab's footprint, and of the dais and the stone circle around it. */
const SLAB_CENTRE: Point2 = [MONOLITH.x + 0.4, MONOLITH.z + 0.8]

/** Hidden glyph path from the Cradle west to the Ghost Garden (no visible trail leads to secrets). */
const GARDEN_PATH: readonly Point2[] = [
  [-12, 238], [-34, 233], [-60, 228], [-88, 221], [-116, 213], [-138, 207],
]

/** The Cradle: the Sundered Monolith landmark and its echo content. */
export function buildCradle(context: StructureContext) {
  buildSunderedMonolith(context)
  buildCradleEchoes(context)
}

/**
 * The slab split down its length, both halves leaning apart on a two-tier dais with the broken ring still turning in
 * the gap. The snapped-off top, the capstone and an arc of the ring lie where they fell, inside a ring of weathered
 * standing stones that opens toward the Cradle (and the pilgrims' approach in the echo).
 */
function buildSunderedMonolith({ scene, collision, animate }: StructureContext) {
  const [cx, cz] = SLAB_CENTRE
  const ground = collision.groundHeight(cx, cz)
  const cos = Math.cos(SLAB.yaw)
  const sin = Math.sin(SLAB.yaw)
  /** Monolith-local (x along the slab face, z out of its front) to world xz. */
  const toWorld = (x: number, z: number): Point2 => [cx + x * cos + z * sin, cz - x * sin + z * cos]
  /** Terrain height at a monolith-local point, relative to the dais centre. */
  const groundAt = (x: number, z: number) => collision.groundHeight(...toWorld(x, z)) - ground
  const box = (x: number, z: number, halfX: number, halfZ: number, yaw: number, bottom: number, top: number) => {
    const [wx, wz] = toWorld(x, z)
    collision.addBox(wx, wz, halfX, halfZ, SLAB.yaw + yaw, ground + bottom, ground + top)
  }
  const cylinder = (x: number, z: number, radius: number, bottom: number, top: number) => {
    const [wx, wz] = toWorld(x, z)
    collision.addCylinder(wx, wz, radius, ground + bottom, ground + top)
  }

  const root = new THREE.Group()
  root.name = 'cradle.monolith'
  root.position.set(cx, ground, cz)
  root.rotation.y = SLAB.yaw
  const stone = createStoneMaterial('#8b7d72')
  const weathered = createStoneMaterial('#6e625d')
  const solid = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    root.add(mesh)
    return mesh
  }

  // Two-tier octagonal dais; each step stays under the player's 0.45 m step-up on the uphill side.
  let low = 0
  let high = 0
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    const h = groundAt(Math.cos(angle) * 6.6, Math.sin(angle) * 6.6)
    low = Math.min(low, h)
    high = Math.max(high, h)
  }
  const tier1 = high + 0.3
  const tier2 = tier1 + 0.4
  const footing = low - 0.8
  const outer = solid(new THREE.CylinderGeometry(6.4, 6.7, tier1 - footing, 8), weathered)
  outer.position.y = (tier1 + footing) / 2
  outer.rotation.y = Math.PI / 8
  const inner = solid(new THREE.CylinderGeometry(4.5, 4.7, tier2 - footing, 8), weathered)
  inner.position.y = (tier2 + footing) / 2
  inner.rotation.y = Math.PI / 8
  cylinder(0, 0, 6.2, footing, tier1)
  cylinder(0, 0, 4.3, footing, tier2)

  // The halves pivot from their footing on the upper tier and lean apart.
  const base = tier2 - 0.5
  const rune = createEnergyMaterial('#56e6ff', 1.3)
  const left = solid(fracturedHalf(25, -1, 1.7), stone)
  left.position.set(-SLAB.width / 4, base, 0)
  left.rotation.set(0.04, 0, 0.12)
  left.add(runeInlay(-0.6, 18, 3, rune))
  const right = solid(fracturedHalf(17, 1, 4.2), stone)
  right.position.set(SLAB.width / 4, base, 0.15)
  right.rotation.set(-0.05, 0.06, -0.2)
  right.add(runeInlay(0.6, 11, 8, rune))
  box(0, 0.07, SLAB.width / 2 + 0.1, SLAB.depth / 2 + 0.05, 0, footing, base + 24)

  // The ring, broken, still turning in the gap between the halves.
  const ringY = base + 12.5
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.16, 10, 72, Math.PI * 1.5),
    createEnergyMaterial('#56e6ff', 4),
  )
  ring.position.set(0.55, ringY, 0)
  root.add(ring)
  animate((_dt, time) => {
    ring.rotation.z = time * 0.22
    ring.position.y = ringY + Math.sin(time * 0.6) * 0.25
  })

  // The snapped-off top of the right half, lying along the slope, flat face up (a climbable perch).
  const fallenAt: Point2 = [7.2, 2.4]
  const fallenYaw = -0.35
  const fallenLength = 8.5
  const along: Point2 = [Math.cos(fallenYaw), -Math.sin(fallenYaw)]
  const g0 = groundAt(...fallenAt)
  const g1 = groundAt(fallenAt[0] + along[0] * fallenLength, fallenAt[1] + along[1] * fallenLength)
  const fallen = solid(fracturedHalf(fallenLength, -1, 7.3, 0.4), stone)
  fallen.position.set(fallenAt[0], g0 + 0.5, fallenAt[1])
  fallen.rotation.set(0, fallenYaw, -Math.PI / 2 + Math.atan2(g1 - g0, fallenLength))
  box(
    fallenAt[0] + (along[0] * fallenLength) / 2,
    fallenAt[1] + (along[1] * fallenLength) / 2,
    fallenLength / 2,
    SLAB.depth / 2,
    fallenYaw,
    Math.min(g0, g1) - 1,
    (g0 + g1) / 2 + 1.8,
  )

  // The capstone, fallen behind the dais and half sunk.
  const capAt: Point2 = [-6.4, -6.2]
  const capY = groundAt(...capAt) + 0.9
  const cap = solid(new THREE.OctahedronGeometry(2.1, 0), stone)
  cap.position.set(capAt[0], capY, capAt[1])
  cap.rotation.set(0.5, 0.8, 0.7)
  cylinder(capAt[0], capAt[1], 1.5, capY - 2.5, capY + 1.3)

  // A shed arc of the ring, dark now.
  const arcAt: Point2 = [4.6, -7.4]
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.16, 8, 20, Math.PI * 0.5),
    createEnergyMaterial('#3aa9c4', 0.35),
  )
  arc.position.set(arcAt[0], groundAt(...arcAt) + 0.12, arcAt[1])
  arc.rotation.set(-Math.PI / 2 + 0.08, 0, 1.1)
  arc.castShadow = true
  root.add(arc)

  // Rubble, thickest on the side the top fell to; none inside the halves' footprint.
  const random = mulberry32(23)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const euler = new THREE.Euler()
  const scale = new THREE.Vector3()
  const shards: THREE.BufferGeometry[] = []
  for (let i = 0; i < 28; i++) {
    const angle = random() * Math.PI * 2
    const distance = 3 + random() * 9
    const x = i < 12 ? Math.abs(Math.cos(angle) * distance) + 2 : Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (Math.abs(x) < 3 && Math.abs(z) < 1.8) continue
    const radius = Math.hypot(x, z)
    const floor = radius < 4.4 ? tier2 : radius < 6.3 ? tier1 : groundAt(x, z)
    const size = 0.25 + random() ** 2 * 1.1
    euler.set(random() * 3, random() * 3, random() * 3)
    rotation.setFromEuler(euler)
    scale.set(size * (0.7 + random() * 0.8), size * (0.5 + random() * 0.6), size * (0.7 + random() * 0.8))
    position.set(x, floor + size * 0.15, z)
    shards.push(new THREE.BoxGeometry(1, 1, 1).applyMatrix4(matrix.compose(position, rotation, scale)))
  }
  solid(merge(shards), stone)

  // Weathered standing stones on a 19 m ring: two broken short, one fallen outward.
  const prism = new THREE.CylinderGeometry(0.55, 0.85, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0)
  const step = new THREE.Matrix4()
  const pillars: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i++) {
    const angle = THREE.MathUtils.degToRad(165 + i * 30) + (random() - 0.5) * 0.12
    const x = Math.cos(angle) * 19
    const z = Math.sin(angle) * 19
    const floor = groundAt(x, z)
    const width = 0.85 + random() * 0.4
    if (i === 6) {
      const length = 5.2
      matrix
        .makeTranslation(x, floor + 0.35, z)
        .multiply(step.makeRotationY(-angle))
        .multiply(step.makeRotationZ(-Math.PI / 2 + 0.05))
        .multiply(step.makeScale(width, length, width))
      pillars.push(prism.clone().applyMatrix4(matrix))
      const half = 0.6 * width
      box(x + (Math.cos(angle) * length) / 2, z + (Math.sin(angle) * length) / 2, length / 2, half, -angle, floor - 1, floor + 0.35 + half)
      continue
    }
    const height = i === 2 || i === 7 ? 1.6 + random() * 0.8 : 3.6 + random() * 3
    matrix
      .makeTranslation(x, floor - 0.4, z)
      .multiply(step.makeRotationY(random() * Math.PI))
      .multiply(step.makeRotationX((random() - 0.5) * 0.16))
      .multiply(step.makeRotationZ((random() - 0.5) * 0.16))
      .multiply(step.makeScale(width, height, width))
    pillars.push(prism.clone().applyMatrix4(matrix))
    cylinder(x, z, 0.7 * width, floor - 1, floor - 0.4 + height)
  }
  prism.dispose()
  solid(merge(pillars), weathered)

  scene.add(root)
}

/**
 * One half of the split slab, pivoting at its base. `side` -1 is the left half (fracture face toward +x), 1 the right.
 * The fracture face is carved jagged and the top snapped off at a slant that falls toward it. Every displacement is a
 * function of position alone, so the vertices that box faces share along their edges move together and no seams open.
 */
function fracturedHalf(height: number, side: -1 | 1, seed: number, snap = 1): THREE.BufferGeometry {
  const width = SLAB.width / 2
  const geometry = new THREE.BoxGeometry(width, height, SLAB.depth, 4, Math.ceil(height / 1.2), 4)
  const position = geometry.attributes.position
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const fracture = (width / 2 - side * x) / width
    const rise = (y + height / 2) / height
    const carve = (0.25 + 0.45 * jag(y * 0.9 + seed, z * 1.7)) * fracture ** 3
    const cut = (1.2 + 2.2 * fracture + 0.5 * jag(x * 2.1 + seed, z * 2.9 - seed)) * snap * rise ** 4
    position.setXY(i, x + side * carve, y - cut)
  }
  geometry.translate(0, height / 2, 0)
  geometry.computeVertexNormals()
  return geometry
}

/** Broken lines of faintly lit glyph inlay running up both faces of a half: still powered, barely. */
function runeInlay(x: number, top: number, seed: number, material: THREE.Material): THREE.Mesh {
  const random = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  for (const face of [1, -1]) {
    const z = face * (SLAB.depth / 2 + 0.012)
    let y = 1.6
    while (y < top) {
      const length = 0.5 + random() * 1.6
      parts.push(new THREE.BoxGeometry(0.13, length, 0.05).translate(x, y + length / 2, z))
      if (random() < 0.45) {
        const tick = 0.3 + random() * 0.4
        const offset = (random() < 0.5 ? -1 : 1) * (tick / 2 + 0.06)
        parts.push(new THREE.BoxGeometry(tick, 0.09, 0.05).translate(x + offset, y + length * random(), z))
      }
      y += length + 0.25 + random() * 0.5
    }
  }
  return new THREE.Mesh(merge(parts), material)
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts)
  for (const part of parts) part.dispose()
  if (!merged) throw new Error('cradle: geometries could not be merged')
  return merged
}

/** Cheap deterministic roughness in [-1, 1] for the fracture surfaces. */
function jag(a: number, b: number): number {
  return 0.5 * Math.sin(a * 1.9 + b * 2.7) + 0.3 * Math.sin(a * 4.3 - b * 3.1 + 1.3) + 0.2 * Math.sin(a * 9.7 + b * 7.9 + 2.1)
}

/** Echo content of the Cradle (M2b): the intact monolith, the pilgrims, the hidden glyph path, crystals, Ghost Garden. */
function buildCradleEchoes({ scene, collision, reactives }: StructureContext) {
  const heightAt = (x: number, z: number) => collision.groundHeight(x, z)
  const m = MONOLITH
  const ground = heightAt(m.x, m.z)
  const front = SLAB_CENTRE

  // The Sundered Monolith as it once stood: one upright slab, its ring and a floating capstone.
  const intact = new THREE.Group()
  intact.name = 'cradle.monolithPast'
  const slab = new THREE.Mesh(new THREE.BoxGeometry(SLAB.width, SLAB.height, SLAB.depth))
  slab.position.set(front[0], ground + SLAB.height / 2, front[1])
  slab.rotation.y = SLAB.yaw
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.22, 10, 72))
  ring.position.set(front[0], ground + 23, front[1])
  ring.rotation.y = SLAB.yaw
  const cap = new THREE.Mesh(new THREE.OctahedronGeometry(2.1, 0))
  cap.position.set(front[0], ground + 33.5, front[1])
  intact.add(slab, ring, cap)
  reactives.add(new PastStateOverlay(scene, intact))

  // Memory: the last procession to the monolith.
  reactives.add(
    new GhostScene(
      scene,
      [
        { path: [[m.x - 17, m.z + 19], [m.x - 9, m.z + 12], [m.x - 4, m.z + 7.5]], endPose: 'kneel', lookAt: front, speed: 1.2 },
        { path: [[m.x + 15, m.z + 21], [m.x + 9, m.z + 13], [m.x + 4.5, m.z + 8]], endPose: 'sing', lookAt: front, speed: 1.05, delay: 0.7 },
        { path: [[m.x + 0.5, m.z + 10]], pose: 'reach', lookAt: front, scale: 1.08 },
      ],
      heightAt,
      'cradle.pilgrims',
    ),
  )

  reactives.add(new GlyphTrail(scene, GARDEN_PATH, collision))
  reactives.add(new CrystalCluster(scene, collision, { x: 13, z: 226, count: 9, spread: 3.2, seed: 11 }))
  reactives.add(new CrystalCluster(scene, collision, { x: m.x - 7, z: m.z + 4, count: 6, spread: 2.2, seed: 5, size: 0.8 }))
  reactives.add(buildGhostGardenSteps(scene, collision))
}

/** Ghost Garden (secret): phase stepping stones spiralling up to a ledge; solid only while revealed. */
function buildGhostGardenSteps(scene: THREE.Scene, collision: Collision): PhaseObject {
  const { x: cx, z: cz } = GHOST_GARDEN
  const base = collision.groundHeight(cx, cz)
  const stone = new THREE.CylinderGeometry(1.2, 1.0, 0.5, 7)
  const parts: PhasePart[] = []
  for (let i = 0; i < 6; i++) {
    const angle = 0.6 + i * 0.75
    const x = cx + Math.cos(angle) * 6
    const z = cz + Math.sin(angle) * 6
    const top = Math.max(collision.groundHeight(x, z) + 0.6, base + 0.7 + i * 0.62)
    parts.push({ geometry: stone, position: { x, y: top - 0.25, z }, yaw: angle, collider: { radius: 1.15, bottom: top - 0.5, top } })
  }
  const ledgeTop = base + 4.3
  parts.push({
    geometry: new THREE.CylinderGeometry(2.6, 2.2, 0.7, 9),
    position: { x: cx, y: ledgeTop - 0.35, z: cz },
    collider: { radius: 2.5, bottom: ledgeTop - 0.7, top: ledgeTop },
  })
  return new PhaseObject(scene, collision, parts, 'garden.phaseSteps')
}
