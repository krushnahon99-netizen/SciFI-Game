import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { type GhostActor, GhostScene } from '../../echo/ghosts'
import { PastStateOverlay } from '../../echo/pastState'
import { mergeParts } from '../geometry'
import { CHOIR, VALE_FORMATIONS, VALE_RIBS } from '../layout'
import { createCrystalMaterial, createEnergyMaterial, createStoneMaterial } from '../materials'
import { mulberry32 } from '../noise'
import type { StructureContext } from './context'

const GLOW = '#3ee6c8'
/** The Choir's broken pipes on the upper tier: angle around the centre (rad), height, radius, outward lean (rad). */
const PIPES = [
  { angle: 0.3, height: 9.5, radius: 0.85, lean: 0.05 },
  { angle: 1.2, height: 5.2, radius: 0.6, lean: 0.12 },
  { angle: 2.0, height: 12.5, radius: 0.95, lean: 0.04 },
  { angle: 2.9, height: 3.6, radius: 0.55, lean: 0.16 },
  { angle: 3.8, height: 8.2, radius: 0.75, lean: 0.08 },
  { angle: 4.7, height: 10.8, radius: 0.8, lean: 0.06 },
  { angle: 5.5, height: 4.4, radius: 0.6, lean: 0.14 },
] as const
/** Heights of the pipes when the Choir was whole (shown by the past-state echo). */
const PAST_HEIGHTS = [24, 19, 30, 17, 22, 27, 20]
const PIPE_RING = 3.3
/** Dais tier radii and riser height (under the player's 0.45 m step-up). */
const DAIS = { lower: 9, upper: 5.6, step: 0.38 }

/** Singing Vale: the Choir, crystal ribs over the trail, great crystal formations and the choir's echo. */
export function buildVale(context: StructureContext) {
  const upperTop = buildChoir(context)
  buildRibs(context)
  VALE_FORMATIONS.forEach((formation, i) => {
    context.reactives.add(
      new CrystalCluster(context.scene, context.collision, { ...formation, seed: 41 + i * 7, shape: 'prism', color: GLOW }),
    )
  })
  buildChoirEchoes(context, upperTop)
}

/** Two-tier octagonal dais, a ring of broken crystal pipes and the dim heart still hovering between them. */
function buildChoir({ scene, collision, animate }: StructureContext): number {
  const { x: cx, z: cz } = CHOIR
  const centre = collision.groundHeight(cx, cz)
  let low = centre
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    low = Math.min(low, collision.groundHeight(cx + Math.cos(a) * DAIS.lower, cz + Math.sin(a) * DAIS.lower))
  }
  const base = low - 0.6
  const lowerTop = centre + DAIS.step
  const upperTop = lowerTop + DAIS.step

  const dais = new THREE.Mesh(
    mergeParts(
      [
        new THREE.CylinderGeometry(DAIS.lower, DAIS.lower + 0.35, lowerTop - base, 8).translate(0, (lowerTop + base) / 2 - centre, 0),
        new THREE.CylinderGeometry(DAIS.upper, DAIS.upper + 0.2, upperTop - base, 8).translate(0, (upperTop + base) / 2 - centre, 0),
      ],
      'choir dais',
    ),
    createStoneMaterial('#7a7066'),
  )
  dais.name = 'vale.choirDais'
  dais.position.set(cx, centre, cz)
  dais.rotation.y = Math.PI / 8
  dais.castShadow = true
  dais.receiveShadow = true
  collision.addCylinder(cx, cz, DAIS.lower - 0.4, base, lowerTop)
  collision.addCylinder(cx, cz, DAIS.upper - 0.3, base, upperTop)

  const energy = createEnergyMaterial(GLOW, 2.2)
  const inlay = new THREE.Mesh(new THREE.TorusGeometry(DAIS.upper - 0.45, 0.05, 4, 64).rotateX(Math.PI / 2), energy)
  inlay.position.set(cx, upperTop + 0.01, cz)

  const random = mulberry32(808)
  const pipeParts = PIPES.map((pipe) => {
    const px = Math.cos(pipe.angle) * PIPE_RING
    const pz = Math.sin(pipe.angle) * PIPE_RING
    // Rotating about (−sin, 0, cos) by a negative angle tips the top away from the centre.
    const axis = new THREE.Vector3(-Math.sin(pipe.angle), 0, Math.cos(pipe.angle))
    collision.addCylinder(cx + px, cz + pz, pipe.radius, upperTop - 1, upperTop + pipe.height * 0.95)
    return brokenPrism(pipe.radius, pipe.height, random)
      .rotateY(random() * Math.PI)
      .applyMatrix4(new THREE.Matrix4().makeRotationAxis(axis, -pipe.lean))
      .translate(px, upperTop - centre - 0.3, pz)
  })
  const pipes = new THREE.Mesh(mergeParts(pipeParts, 'choir pipes'), createCrystalMaterial(GLOW, 1.1))
  pipes.name = 'vale.choirPipes'
  pipes.position.set(cx, centre, cz)
  pipes.castShadow = true

  const heartY = upperTop + 6
  const heart = new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), energy)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.05, 6, 64), energy)
  heart.position.set(cx, heartY, cz)
  halo.position.copy(heart.position)
  animate((_dt, time) => {
    heart.rotation.y = time * 0.5
    heart.position.y = heartY + Math.sin(time * 0.8) * 0.35
    halo.position.y = heart.position.y
    halo.rotation.set(Math.PI / 2 + Math.sin(time * 0.3) * 0.35, time * 0.2, Math.cos(time * 0.25) * 0.3)
  })

  scene.add(dais, inlay, pipes, heart, halo)
  return upperTop
}

/** Hexagonal pipe standing on y = 0 whose top is snapped off into a jagged, dished break. */
function brokenPrism(radius: number, height: number, random: () => number): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radius * 0.92, radius, height, 6).translate(0, height / 2, 0)
  const position = geometry.attributes.position
  const phaseA = random() * Math.PI * 2
  const phaseB = random() * Math.PI * 2
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i)
    if (y < height - 1e-3) continue
    const x = position.getX(i)
    const z = position.getZ(i)
    // Offsets depend only on the angle, so the side wall and the cap ring (duplicate vertices) stay joined.
    const a = Math.atan2(z, x)
    const offset =
      Math.hypot(x, z) < 1e-4 ? -radius * 0.5 : radius * (0.9 * Math.sin(a + phaseA) + 0.6 * Math.sin(3 * a + phaseB))
    position.setY(i, y + offset)
  }
  geometry.computeVertexNormals()
  return geometry
}

/** Per rib: lean along the trail (m, + = down-valley), snapped at the apex, random seed. */
const RIB_STYLE = [
  { lean: 3, broken: false, seed: 3 },
  { lean: -2.5, broken: true, seed: 7 },
  { lean: 5, broken: false, seed: 11 },
] as const
const DOWN_VALLEY = new THREE.Vector3(-0.733, 0, -0.681)

/** Faceted crystal ribs arching over the trail as it drops into the Vale; the middle one is snapped at the apex. */
function buildRibs({ scene, collision }: StructureContext) {
  const parts: THREE.BufferGeometry[] = []
  VALE_RIBS.forEach((rib, i) => {
    const style = RIB_STYLE[i % RIB_STYLE.length]
    const random = mulberry32(style.seed)
    const ya = collision.groundHeight(rib.a[0], rib.a[1])
    const yb = collision.groundHeight(rib.b[0], rib.b[1])
    const a = new THREE.Vector3(rib.a[0], ya - 1.2, rib.a[1])
    const b = new THREE.Vector3(rib.b[0], yb - 1.2, rib.b[1])
    const mid = a.clone().lerp(b, 0.5)
    const apexY = Math.max(ya, yb) + rib.height
    // Quadratic Bézier: the peak (t = 0.5) lies half-way between the feet's midpoint and the control point.
    const control = new THREE.Vector3(mid.x, 2 * apexY - mid.y, mid.z).addScaledVector(DOWN_VALLEY, style.lean)
    const curve = new THREE.QuadraticBezierCurve3(a, control, b)
    const side = new THREE.Vector3().subVectors(b, a).cross(THREE.Object3D.DEFAULT_UP).normalize()
    const radiusAt = (t: number) => rib.radius * (1 - 0.55 * t) * (0.85 + 0.3 * Math.sin(t * Math.PI))
    const facets = Array.from({ length: 6 }, () => 0.8 + random() * 0.4)
    const spans = style.broken ? [[0, 0.43], [0.6, 1]] : [[0, 1]]
    for (const [t0, t1] of spans) {
      parts.push(crystalTube(curve, side, t0, t1, facets, radiusAt))
      if (t0 > 0) parts.push(shard(curve, side, t0, radiusAt(t0) * 1.05, radiusAt(t0) * (2 + random()), 0, -1))
      if (t1 < 1) parts.push(shard(curve, side, t1, radiusAt(t1) * 1.05, radiusAt(t1) * (2 + random()), 0, 1))
    }
    for (let s = 0, n = 5 + Math.floor(random() * 3); s < n; s++) {
      const t = 0.1 + random() * 0.8
      if (style.broken && t > 0.4 && t < 0.63) continue
      const r = radiusAt(t)
      parts.push(shard(curve, side, t, r * (0.3 + 0.2 * random()), r * (1.6 + 1.6 * random()), random() * Math.PI * 2, 0))
    }
    collision.addCylinder(rib.a[0], rib.a[1], rib.radius * 0.9, ya - 2, ya + 3)
    collision.addCylinder(rib.b[0], rib.b[1], rib.radius * 0.5, yb - 2, yb + 3)
  })
  const ribs = new THREE.Mesh(mergeParts(parts, 'vale ribs'), createCrystalMaterial(GLOW, 0.65))
  ribs.name = 'vale.ribs'
  ribs.castShadow = true
  scene.add(ribs)
}

const scratchPoint = new THREE.Vector3()
const scratchTangent = new THREE.Vector3()
const scratchS = new THREE.Vector3()
const scratchN = new THREE.Vector3()

/** Frame at `t`: S = `side` made perpendicular to the tangent T, N = T × S (so S × N = T). */
function frameAt(curve: THREE.Curve<THREE.Vector3>, side: THREE.Vector3, t: number) {
  curve.getPointAt(t, scratchPoint)
  curve.getTangentAt(t, scratchTangent)
  scratchS.copy(side).addScaledVector(scratchTangent, -side.dot(scratchTangent)).normalize()
  scratchN.crossVectors(scratchTangent, scratchS)
  return { point: scratchPoint, tangent: scratchTangent, s: scratchS, n: scratchN }
}

/**
 * Tube over [t0, t1] of `curve` with uneven facets (one radius factor per side) that twist slowly along it.
 * Uses a side-vector frame instead of Frenet frames, which flip on near-planar arches.
 */
function crystalTube(
  curve: THREE.Curve<THREE.Vector3>,
  side: THREE.Vector3,
  t0: number,
  t1: number,
  facets: readonly number[],
  radiusAt: (t: number) => number,
): THREE.BufferGeometry {
  const radial = facets.length
  const segments = Math.max(4, Math.round(40 * (t1 - t0)))
  const positions = new Float32Array((segments + 1) * (radial + 1) * 3)
  let k = 0
  for (let i = 0; i <= segments; i++) {
    const t = t0 + ((t1 - t0) * i) / segments
    const { point, s, n } = frameAt(curve, side, t)
    const r = radiusAt(t)
    for (let j = 0; j <= radial; j++) {
      const angle = (j / radial) * Math.PI * 2 + t * 0.9
      const rj = r * facets[j % radial]
      const c = Math.cos(angle) * rj
      const sn = Math.sin(angle) * rj
      positions[k++] = point.x + c * s.x + sn * n.x
      positions[k++] = point.y + c * s.y + sn * n.y
      positions[k++] = point.z + c * s.z + sn * n.z
    }
  }
  // With S × N = T, (a, d, b) and (d, c, b) wind counter-clockwise seen from outside.
  const indices: number[] = []
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j
      const b = (i + 1) * (radial + 1) + j
      const c = (i + 1) * (radial + 1) + j + 1
      const d = i * (radial + 1) + j + 1
      indices.push(a, d, b, d, c, b)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Hexagonal crystal point on the curve at `t`. `along` = ±1 points it along the tangent (a broken end's cap);
 * 0 makes a spike growing out of the side at `angle`, tipped upward and a little along the rib.
 */
function shard(
  curve: THREE.Curve<THREE.Vector3>,
  side: THREE.Vector3,
  t: number,
  radius: number,
  length: number,
  angle: number,
  along: number,
): THREE.BufferGeometry {
  const { point, tangent, s, n } = frameAt(curve, side, t)
  const dir = new THREE.Vector3()
  const base = point.clone()
  if (along !== 0) {
    dir.copy(tangent).multiplyScalar(along)
  } else {
    dir.copy(s).multiplyScalar(Math.cos(angle)).addScaledVector(n, Math.sin(angle))
    if (dir.y < -0.3) dir.negate()
    base.addScaledVector(dir, radius * 1.2)
    dir.addScaledVector(tangent, 0.3 * Math.sin(angle * 3)).normalize()
  }
  const geometry = new THREE.ConeGeometry(radius, length, 6).translate(0, length / 2, 0)
  geometry.deleteAttribute('uv')
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(THREE.Object3D.DEFAULT_UP, dir))
  return geometry.translate(base.x, base.y, base.z)
}

/** The Choir as it once stood (pipes rising into a crowned spire) and the ring of singers that played it. */
function buildChoirEchoes({ scene, collision, reactives }: StructureContext, upperTop: number) {
  const { x: cx, z: cz } = CHOIR
  const intact = new THREE.Group()
  intact.name = 'vale.choirPast'
  PIPES.forEach((pipe, i) => {
    const height = PAST_HEIGHTS[i]
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(pipe.radius * 0.7, pipe.radius, height, 6))
    mesh.position.set(cx + Math.cos(pipe.angle) * PIPE_RING, upperTop + height / 2, cz + Math.sin(pipe.angle) * PIPE_RING)
    intact.add(mesh)
  })
  const crown = new THREE.Mesh(new THREE.TorusGeometry(PIPE_RING + 0.6, 0.18, 6, 48))
  crown.rotation.x = Math.PI / 2
  crown.position.set(cx, upperTop + 16, cz)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.14, 6, 40))
  ring.rotation.x = Math.PI / 2
  ring.position.set(cx, upperTop + 26, cz)
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 0))
  core.position.set(cx, upperTop + 34, cz)
  intact.add(crown, ring, core)
  reactives.add(new PastStateOverlay(scene, intact))

  const singers: GhostActor[] = []
  for (let i = 0; i < 6; i++) {
    const a = 0.5 + (i / 6) * Math.PI * 2
    singers.push({
      path: [[cx + Math.cos(a) * 11, cz + Math.sin(a) * 11]],
      pose: 'sing',
      lookAt: [cx, cz],
      scale: 0.95 + (i % 3) * 0.05,
    })
  }
  reactives.add(new GhostScene(scene, singers, (x, z) => collision.groundHeight(x, z), 'vale.choir'))
}
