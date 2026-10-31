import * as THREE from 'three'
import { GhostScene } from '../../echo/ghosts'
import { PulseGlow } from '../../echo/glow'
import { PastStateOverlay } from '../../echo/pastState'
import { block, mergeParts } from '../geometry'
import { PLANET_DIRECTION, SLEEPING_GIANT, type Point2 } from '../layout'
import { createEnergyMaterial, createStoneMaterial } from '../materials'
import type { StructureContext } from './context'

/** Giant-local +z points along the ringed planet's bearing. */
const YAW = Math.atan2(PLANET_DIRECTION.x, PLANET_DIRECTION.z)
/**
 * The head: an ellipsoid (radii r*) with a carved face, built upright (crown +y, face +z), then rested a little on
 * one side (`roll`) and tipped back (`tilt`) so it rises out of the sand chin-first, gazing up at the planet.
 * `lift` = centre above the lowest ground under it; `step` = depth of the unfinished quarry cuts on the back.
 */
const HEAD = { x: -3, z: -3, lift: 0.6, rx: 4.6, ry: 6, rz: 5.2, roll: 0.22, tilt: -0.6, step: 1.1 }
/** A shoulder breaking the sand behind the head (`top` above the lowest ground under it). */
const SHOULDER = { x: -10, z: -6, rx: 4.2, ry: 2.6, rz: 3.8, top: 1.5 }
/** Forearm rising out of the sand toward the planet: buried base and wrist (y relative to the ground at the base). */
const ARM = { base: [10, -2.2, 4], wrist: [8.5, 4.6, 8], radii: [1.25, 0.95] } as const
/** Rough-cut blocks the carvers left: x, z, width, height, depth, yaw (giant-local). */
const QUARRY: readonly (readonly [number, number, number, number, number, number])[] = [
  [-16.5, 1, 3.6, 2.6, 2.8, 0.3],
  [-12, 10, 2.6, 1.8, 2.2, -0.5],
  [3, -13, 4.2, 2.2, 3, 0.15],
  [15, -4, 3, 2, 2.4, 0.8],
  [-11.5, -13.5, 2, 1.4, 1.7, 1.1],
]
const STONE = '#9a8873'
const ROUGH = '#7d6e60'
const GLOW = '#8ff3ff'
/** Closed eyes and brow sigil: dim at rest, lit while a pulse keeps the giant stirring. */
const EYES = { rest: 0.35, peak: 7, hold: 14, fadeIn: 1.6, fadeOut: 3.5 }
const UP = new THREE.Vector3(0, 1, 0)
const ONE = new THREE.Vector3(1, 1, 1)

export interface SleepingGiant {
  /** On the sand in front of the face: where the explorer inspects it. */
  readonly face: THREE.Vector3
  /** 0..1 while a pulse keeps the giant stirring (eyes and brow sigil lit). */
  readonly awake: number
}

/**
 * The Sleeping Giant (secret): a colossal unfinished statue buried in the sand, its head tipped back with the face
 * turned up toward the ringed planet, a shoulder and one hand breaking the surface. A pulse lights its closed eyes and
 * replays its carvers at work around their scaffold; while it stirs, the explorer can inspect it (gameplay/secrets.ts).
 */
export function buildSleepingGiant({ scene, collision, reactives }: StructureContext): SleepingGiant {
  const cos = Math.cos(YAW)
  const sin = Math.sin(YAW)
  const toWorld = (x: number, z: number): Point2 => [
    SLEEPING_GIANT.x + x * cos + z * sin,
    SLEEPING_GIANT.z - x * sin + z * cos,
  ]
  const ground = (x: number, z: number) => collision.groundHeight(...toWorld(x, z))
  /** Lowest ground over a footprint, so nothing floats on a slope. */
  const lowest = (x: number, z: number, halfX: number, halfZ: number) => {
    let low = Infinity
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) low = Math.min(low, ground(x + i * halfX, z + j * halfZ))
    return low
  }
  const box = (x: number, z: number, halfX: number, halfZ: number, yaw: number, bottom: number, top: number) => {
    const [wx, wz] = toWorld(x, z)
    collision.addBox(wx, wz, halfX, halfZ, YAW + yaw, bottom, top)
  }
  const cylinder = (x: number, z: number, radius: number, bottom: number, top: number) => {
    const [wx, wz] = toWorld(x, z)
    collision.addCylinder(wx, wz, radius, bottom, top)
  }

  // Giant-local frame: rotated to the planet, y stays world height.
  const root = new THREE.Group()
  root.name = 'giant'
  root.position.set(SLEEPING_GIANT.x, 0, SLEEPING_GIANT.z)
  root.rotation.y = YAW
  const stone = createStoneMaterial(STONE)
  const rough = createStoneMaterial(ROUGH)
  const glow = createEnergyMaterial(GLOW, EYES.rest)
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, shadows = true) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = shadows
    mesh.receiveShadow = shadows
    root.add(mesh)
  }

  const headBase = lowest(HEAD.x, HEAD.z + 1.4, 4.4, 4.4)
  const headY = headBase + HEAD.lift
  const headMatrix = new THREE.Matrix4()
    .makeTranslation(HEAD.x, headY, HEAD.z)
    .multiply(new THREE.Matrix4().makeRotationX(HEAD.tilt))
    .multiply(new THREE.Matrix4().makeRotationZ(HEAD.roll))
  add(headGeometry(headMatrix), stone)
  add(mergeParts([lidSeam(1, headMatrix), lidSeam(-1, headMatrix), browSigil(headMatrix)], 'giant.glow'), glow, false)
  box(HEAD.x, HEAD.z + 1.4, 4.4, 4.4, 0, headBase - 1, headY + 5.6)

  const shoulderTop = lowest(SHOULDER.x, SHOULDER.z, 3.5, 3.5) + SHOULDER.top
  add(
    new THREE.SphereGeometry(1, 40, 24)
      .scale(SHOULDER.rx, SHOULDER.ry, SHOULDER.rz)
      .translate(SHOULDER.x, shoulderTop - SHOULDER.ry, SHOULDER.z),
    stone,
  )
  cylinder(SHOULDER.x, SHOULDER.z, 3.4, shoulderTop - 4, shoulderTop)

  const armGround = ground(ARM.base[0], ARM.base[2])
  const base = new THREE.Vector3(ARM.base[0], armGround + ARM.base[1], ARM.base[2])
  const wrist = new THREE.Vector3(ARM.wrist[0], armGround + ARM.wrist[1], ARM.wrist[2])
  const arm = armGeometry(base, wrist)
  add(arm.carved, stone)
  add(arm.uncut, rough)
  const emerge = base.clone().lerp(wrist, -ARM.base[1] / (ARM.wrist[1] - ARM.base[1]))
  cylinder(emerge.x, emerge.z, 1.4, armGround - 2, armGround + 3.5)

  const blocks: THREE.BufferGeometry[] = []
  for (const [x, z, width, height, depth, yaw] of QUARRY) {
    const bottom = lowest(x, z, width / 2, depth / 2) - 0.25
    blocks.push(block(width, height, depth).rotateY(yaw).translate(x, bottom, z))
    box(x, z, width / 2, depth / 2, yaw, bottom - 0.5, bottom + height)
  }
  add(mergeParts(blocks, 'giant.quarry'), rough)
  scene.add(root)

  // Echoes: the carvers' scaffold and crane, the carvers themselves (one sings to the sleeper), the eyes lighting.
  const past = new THREE.Group()
  past.name = 'giant.scaffoldPast'
  past.position.copy(root.position)
  past.rotation.y = YAW
  past.add(new THREE.Mesh(scaffoldGeometry(headBase)))
  reactives.add(new PastStateOverlay(scene, past))

  const faceCentre = toWorld(HEAD.x, HEAD.z + 4.3)
  reactives.add(
    new GhostScene(
      scene,
      [
        { path: [toWorld(HEAD.x - 2, HEAD.z + 7)], pose: 'reach', lookAt: faceCentre, scale: 1.05 },
        {
          path: [toWorld(-13, 9), toWorld(-8, 7), toWorld(HEAD.x + 2.5, HEAD.z + 7.2)],
          endPose: 'reach',
          lookAt: faceCentre,
          speed: 0.9,
        },
        { path: [toWorld(HEAD.x + 0.5, HEAD.z + 11.5)], pose: 'sing', lookAt: faceCentre },
        { path: [toWorld(5.5, 11)], pose: 'kneel', lookAt: toWorld(wrist.x, wrist.z) },
      ],
      (x, z) => collision.groundHeight(x, z),
      'giant.carvers',
    ),
  )

  const [cx, cz] = toWorld(HEAD.x, HEAD.z)
  const wake = reactives.add(new PulseGlow(new THREE.Vector3(cx, headY + 3, cz), 7, [glow], EYES))
  const [fx, fz] = toWorld(HEAD.x, HEAD.z + 9)
  const face = new THREE.Vector3(fx, collision.groundHeight(fx, fz), fz)
  return {
    face,
    get awake() {
      return wake.amount
    },
  }
}

const smooth = THREE.MathUtils.smoothstep
const bump = (v: number) => Math.exp(-v * v)

/** Head surface along the unit direction `u` (head frame: crown +y, face +z), in metres from the head centre. */
function headPoint(u: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  const { rx, ry, rz, step } = HEAD
  const ax = Math.abs(u.x)
  const jaw = smooth(-u.y, 0.05, 0.75)
  const x = rx * u.x * (1 - 0.26 * jaw)
  const y = ry * u.y
  let z = rz * u.z * (u.z < 0 ? 1.06 : 1)
  const front = smooth(u.z, 0.25, 0.7)
  if (front > 0) {
    let relief = 1.2 * u.x * u.x
    relief += 0.7 * bump((u.y - 0.19) / 0.06) * (1 - smooth(ax, 0.32, 0.55))
    relief -= 1.05 * bump(Math.hypot((ax - 0.26) / 0.12, (u.y - 0.06) / 0.075))
    relief += 0.6 * bump(Math.hypot((ax - 0.26) / 0.095, (u.y - 0.055) / 0.05))
    relief += 0.4 * bump(Math.hypot((ax - 0.43) / 0.12, (u.y + 0.04) / 0.1))
    const bridge = 0.6 + 0.75 * smooth(-u.y, -0.12, 0.2)
    relief += bridge * bump(u.x / 0.09) * smooth(u.y, -0.24, -0.15) * (1 - smooth(u.y, 0.08, 0.17))
    relief += 0.55 * bump(Math.hypot(u.x / 0.12, (u.y + 0.2) / 0.05))
    relief += 0.35 * bump(Math.hypot((ax - 0.1) / 0.05, (u.y + 0.21) / 0.04))
    relief += 0.4 * bump((u.y + 0.39) / 0.05) * (1 - smooth(ax, 0.14, 0.26))
    relief -= 0.45 * bump((u.y + 0.385) / 0.025) * (1 - smooth(ax, 0.1, 0.24))
    relief += 0.6 * bump(Math.hypot(u.x / 0.16, (u.y + 0.62) / 0.1))
    z += relief * front
  }
  // Never finished: the back of the skull is still in stepped quarry cuts.
  const unfinished = smooth(-u.z, -0.05, 0.3)
  if (unfinished > 0) z = THREE.MathUtils.lerp(z, Math.round(z / step) * step, unfinished)
  return out.set(x, y, z)
}

function headGeometry(matrix: THREE.Matrix4): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 160, 120)
  const position = geometry.attributes.position
  const u = new THREE.Vector3()
  const point = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    u.fromBufferAttribute(position, i).normalize()
    headPoint(u, point)
    position.setXYZ(i, point.x, point.y, point.z)
  }
  geometry.computeVertexNormals()
  return geometry.applyMatrix4(matrix)
}

/** The glowing seam between the closed lids of one eye (`side` ±1 in the head frame). */
function lidSeam(side: 1 | -1, matrix: THREE.Matrix4): THREE.BufferGeometry {
  const points: THREE.Vector3[] = []
  const u = new THREE.Vector3()
  for (let i = 0; i <= 12; i++) {
    const t = i / 12
    const ax = 0.18 + 0.16 * t
    const uy = 0.045 - 0.015 * Math.sin(Math.PI * t)
    u.set(side * ax, uy, Math.sqrt(1 - ax * ax - uy * uy))
    const point = headPoint(u, new THREE.Vector3())
    point.z += 0.07
    points.push(point.applyMatrix4(matrix))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.09, 6, false)
}

/** Diamond sigil on the brow, flat on the surface. */
function browSigil(matrix: THREE.Matrix4): THREE.BufferGeometry {
  const u = new THREE.Vector3(0, 0.36, 0.93).normalize()
  const point = headPoint(u, new THREE.Vector3())
  const normal = new THREE.Vector3(u.x / HEAD.rx, u.y / HEAD.ry, u.z / HEAD.rz).normalize()
  const across = new THREE.Vector3(1, 0, 0)
  const up = new THREE.Vector3().crossVectors(normal, across)
  point.addScaledVector(normal, 0.05)
  return new THREE.BoxGeometry(0.62, 0.62, 0.12)
    .rotateZ(Math.PI / 4)
    .scale(0.8, 1.25, 1)
    .applyMatrix4(new THREE.Matrix4().makeBasis(across, up, normal).setPosition(point))
    .applyMatrix4(matrix)
}

/** `geometry` (built along +y around the origin) turned to `dir` and centred on `centre`. */
function oriented(geometry: THREE.BufferGeometry, centre: THREE.Vector3, dir: THREE.Vector3): THREE.BufferGeometry {
  const rotation = new THREE.Quaternion().setFromUnitVectors(UP, dir)
  return geometry.applyMatrix4(new THREE.Matrix4().compose(centre, rotation, ONE))
}

/**
 * Forearm, palm, two carved fingers and the thumb, open toward the planet; the last two fingers are still one uncut
 * block (`uncut`, rough stone).
 */
function armGeometry(base: THREE.Vector3, wrist: THREE.Vector3) {
  const along = wrist.clone().sub(base)
  const length = along.length()
  along.divideScalar(length)
  const toPlanet = new THREE.Vector3(0, 0.3, 1).normalize()
  const hand = along.clone().addScaledVector(toPlanet, -0.35).normalize()
  const palm = toPlanet.clone().addScaledVector(hand, -toPlanet.dot(hand)).normalize()
  const side = new THREE.Vector3().crossVectors(hand, palm)

  const carved: THREE.BufferGeometry[] = [
    oriented(new THREE.CylinderGeometry(ARM.radii[1], ARM.radii[0], length, 18, 2), base.clone().lerp(wrist, 0.5), along),
    new THREE.SphereGeometry(1.02, 18, 12).translate(wrist.x, wrist.y, wrist.z),
    new THREE.BoxGeometry(2.5, 2.9, 0.95).applyMatrix4(
      new THREE.Matrix4().makeBasis(side, hand, palm).setPosition(wrist.clone().addScaledVector(hand, 1.45)),
    ),
  ]
  const segment = (start: THREE.Vector3, dir: THREE.Vector3, length: number, radius: number) =>
    carved.push(oriented(new THREE.CapsuleGeometry(radius, length, 4, 10), start.clone().addScaledVector(dir, length / 2), dir))

  const knuckles = wrist.clone().addScaledVector(hand, 2.85)
  const fingers = [
    { offset: 0.78, scale: 0.95, radius: 0.3, curl: [0.12, 0.28, 0.3] },
    { offset: 0.2, scale: 1, radius: 0.32, curl: [0.2, 0.38, 0.35] },
  ]
  for (const finger of fingers) {
    const point = knuckles.clone().addScaledVector(side, finger.offset)
    let angle = 0
    ;[1.3, 0.9, 0.7].forEach((bone, k) => {
      angle += finger.curl[k]
      const dir = hand.clone().multiplyScalar(Math.cos(angle)).addScaledVector(palm, Math.sin(angle))
      const boneLength = bone * finger.scale
      segment(point, dir, boneLength, finger.radius * (1 - k * 0.08))
      point.addScaledVector(dir, boneLength)
    })
  }
  const thumb = wrist.clone().addScaledVector(hand, 0.9).addScaledVector(side, 1.2).addScaledVector(palm, 0.15)
  let thumbDir = side.clone().multiplyScalar(0.7).addScaledVector(hand, 0.6).addScaledVector(palm, 0.4).normalize()
  for (const [boneLength, radius] of [
    [1.2, 0.38],
    [0.95, 0.34],
  ]) {
    segment(thumb, thumbDir, boneLength, radius)
    thumb.addScaledVector(thumbDir, boneLength)
    thumbDir = thumbDir.clone().addScaledVector(hand, 0.5).addScaledVector(palm, 0.3).normalize()
  }

  const blockDir = hand.clone().multiplyScalar(Math.cos(0.25)).addScaledVector(palm, Math.sin(0.25))
  const blockNormal = new THREE.Vector3().crossVectors(side, blockDir)
  const uncut = new THREE.BoxGeometry(1.1, 2.3, 0.75).applyMatrix4(
    new THREE.Matrix4()
      .makeBasis(side, blockDir, blockNormal)
      .setPosition(knuckles.clone().addScaledVector(side, -0.62).addScaledVector(blockDir, 1.1)),
  )
  return { carved: mergeParts(carved, 'giant.arm'), uncut }
}

/** Past state: the carvers' scaffold around the head and the crane hoisting the next block (giant-local). */
function scaffoldGeometry(base: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const beam = (w: number, h: number, d: number, x: number, y: number, z: number, roll = 0) =>
    parts.push(new THREE.BoxGeometry(w, h, d).rotateZ(roll).translate(x, y, z))
  const front = HEAD.z + 7.4
  const back = HEAD.z - 5.5
  for (const x of [HEAD.x - 5.6, HEAD.x + 5.6]) {
    for (const z of [front, back]) beam(0.36, 10.5, 0.36, x, base + 4.75, z)
    beam(0.3, 0.3, front - back + 0.8, x, base + 9.3, (front + back) / 2)
  }
  for (const y of [3.3, 6.6]) beam(12, 0.16, 1.5, HEAD.x, base + y, front - 0.55)
  beam(12, 0.3, 0.3, HEAD.x, base + 9.3, back)
  const brace = Math.hypot(5.6, 3.3)
  beam(brace, 0.22, 0.22, HEAD.x - 2.8, base + 4.95, front + 0.1, Math.atan2(3.3, 5.6))
  beam(brace, 0.22, 0.22, HEAD.x + 2.8, base + 4.95, front + 0.1, -Math.atan2(3.3, 5.6))
  const mast = HEAD.x - 10
  beam(0.5, 13.5, 0.5, mast, base + 6.25, HEAD.z + 3)
  beam(9.5, 0.36, 0.36, mast + 4.5, base + 12.6, HEAD.z + 3)
  beam(0.07, 3.4, 0.07, mast + 8.6, base + 10.8, HEAD.z + 3)
  beam(2.3, 1.6, 1.7, mast + 8.6, base + 8.4, HEAD.z + 3)
  return mergeParts(parts, 'giant.scaffold')
}
