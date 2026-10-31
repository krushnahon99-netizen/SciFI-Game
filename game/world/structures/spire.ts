import * as THREE from 'three'
import { CrystalCluster } from '../../echo/crystals'
import { GhostScene } from '../../echo/ghosts'
import { PastStateOverlay } from '../../echo/pastState'
import type { Collision } from '../../physics/collision'
import { sharedUniforms } from '../../render/shaderChunks'
import { Batch, block, mergeParts } from '../geometry'
import { SPIRE } from '../layout'
import { createEnergyMaterial, createStoneMaterial } from '../materials'
import type { Animator, StructureContext } from './context'

const GLOW = '#56e6ff'
/** The barrier and its sigils share the Heart's warm gold: it answers to the Heart Key. */
const SEAL = '#ffc27a'
/** The ramp reaches the summit here; the barrier's gate faces it. */
const GATE_ANGLE = SPIRE.ramp.end
const RING = { radius: 10.5, count: 12, pylon: 0.9, height: 3.9, gateHeight: 5.6, panel: 3.5 }
const TIERS = [
  { radius: 7, height: 0.3 },
  { radius: 4.6, height: 0.6 },
]
/** Three leaning vanes around the Stone; their tips gather over it. The third one snapped long ago. */
const VANES = { radius: 8.4, lean: (14 * Math.PI) / 180, height: 26, broken: 15.5, width: 1.8, depth: 1.3 }
const CROWN_HEIGHT = 26.5
const OPEN_TIME = 3.2
const STONE = { radius: 1.1, height: 1.2 }

type BoxCollider = ReturnType<Collision['addBox']>

const BARRIER_VERTEX = /* glsl */ `
varying vec2 vBarrierUv;
varying vec3 vBarrierWorld;
void main() {
  vBarrierUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vBarrierWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Additive curtain: slow flowing noise, rising streaks, bright rims at foot and crown. Dissolves into noise as uOpen
// rises. Distance fade stands in for fog, as in the hologram shader.
const BARRIER_FRAGMENT = /* glsl */ `
uniform float uEchoTime;
uniform sampler2D uEchoNoise;
uniform vec3 uColor;
uniform float uOpen;
varying vec2 vBarrierUv;
varying vec3 vBarrierWorld;
void main() {
  float dist = length(cameraPosition - vBarrierWorld);
  vec2 p = vec2(vBarrierWorld.x + vBarrierWorld.z, vBarrierWorld.y);
  float flow = texture(uEchoNoise, p * vec2(0.09, 0.05) + vec2(0.0, -uEchoTime * 0.06)).g;
  float grain = texture(uEchoNoise, p * vec2(0.35, 0.12) + vec2(uEchoTime * 0.02, -uEchoTime * 0.15)).b;
  float y = vBarrierUv.y;
  float rims = exp(-y * 14.0) * 1.1 + exp(-(1.0 - y) * 22.0) * 0.6;
  float body = (0.03 + 0.16 * flow + pow(grain, 4.0) * 0.9) * (1.0 - 0.55 * smoothstep(0.35, 1.0, y));
  float sides = smoothstep(0.0, 0.05, vBarrierUv.x) * smoothstep(0.0, 0.05, 1.0 - vBarrierUv.x);
  float solid = smoothstep(-0.06, 0.06, (1.0 - uOpen) * 1.15 - 0.08 - flow);
  gl_FragColor = vec4(uColor * (body * sides + rims) * solid * exp(-dist * 0.005), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** The energy ring around the summit. `open()` drops its colliders at once and dissolves the curtain. */
export class SpireBarrier {
  private progress = 0
  private opening = false

  constructor(
    private readonly curtain: THREE.Mesh,
    private readonly material: THREE.ShaderMaterial,
    private readonly colliders: readonly BoxCollider[],
    private readonly sigil: THREE.MeshStandardMaterial,
  ) {}

  get isOpen(): boolean {
    return this.opening
  }

  /** Heart Key brought to the gate, or loaded as already open (`instant`). */
  open(instant = false) {
    this.opening = true
    for (const collider of this.colliders) collider.enabled = false
    this.sigil.emissiveIntensity = 0.5
    if (instant) this.setProgress(1)
  }

  readonly update: Animator = (dt) => {
    if (this.opening && this.progress < 1) this.setProgress(Math.min(1, this.progress + dt / OPEN_TIME))
  }

  private setProgress(value: number) {
    this.progress = value
    this.material.uniforms.uOpen.value = value
    this.curtain.visible = value < 1
  }
}

export interface ListeningSpire {
  /** Top centre of the Listening Stone (the finale trigger measures from here). */
  readonly stone: THREE.Vector3
  /** On the summit just outside the barrier's gate, where the ramp arrives (the Heart Key check measures from here). */
  readonly gate: THREE.Vector3
  /** Under the gate's lintel: where the Heart Key floats once it has been set into the gate. */
  readonly socket: THREE.Vector3
  readonly barrier: SpireBarrier
  /** Wakes the Stone's core and the crown over it, 0…1 (finale). */
  setAwake(level: number): void
}

interface Materials {
  stone: THREE.Material
  dark: THREE.Material
  glyph: THREE.Material
  seal: THREE.MeshStandardMaterial
  core: THREE.MeshStandardMaterial
}

/** A point on the spiral ramp's centre line (`s` 0 = foot, 1 = summit), pushed `offset` metres outward. */
function rampPoint(s: number, offset = 0) {
  const { start, end, r0, r1 } = SPIRE.ramp
  const angle = start + (end - start) * s
  const radius = r0 + (r1 - r0) * s + offset
  return { x: SPIRE.x + Math.cos(angle) * radius, z: SPIRE.z + Math.sin(angle) * radius, angle }
}

const ringPoint = (angle: number, radius: number) => ({
  x: SPIRE.x + Math.cos(angle) * radius,
  z: SPIRE.z + Math.sin(angle) * radius,
})

/** Indexed octahedron (`OctahedronGeometry` is non-indexed and can't be merged into a Batch with the other parts). */
const gem = (radius: number) => new THREE.SphereGeometry(radius, 4, 2)

/** Rotation that turns local +z outward at `angle` around the summit (local x runs along the ring). */
const facing = (angle: number) => Math.PI / 2 - angle

/**
 * The Listening Spire's summit: a stepped dais with the Listening Stone, three leaning vanes whose tips gather under a
 * floating crown, a ring of pylons holding an energy barrier (gate facing the ramp's end), waystones up the spiral
 * ramp and a ruined gate at its foot.
 */
export function buildSpire(context: StructureContext): ListeningSpire {
  const { scene, collision, animate } = context
  const top = collision.groundHeight(SPIRE.x, SPIRE.z)
  const m: Materials = {
    stone: createStoneMaterial('#8a7f7a'),
    dark: createStoneMaterial('#5f5655'),
    glyph: createEnergyMaterial(GLOW, 1.6),
    seal: createEnergyMaterial(SEAL, 2.4),
    core: createEnergyMaterial(GLOW, 0.7),
  }
  const batch = new Batch()

  buildSummit(collision, batch, m, top)
  buildVanes(collision, batch, m, top)
  const barrier = buildBarrier(scene, collision, batch, m, top)
  buildRamp(collision, batch, m)
  batch.build(scene, 'spire.summit', m.glyph, m.seal, m.core)
  animate(barrier.update)

  const stone = new THREE.Vector3(SPIRE.x, top + TIERS[1].height + STONE.height, SPIRE.z)
  const crown = buildCrown(scene, m, top, stone, animate)
  buildSpireEchoes(context, top)

  const gatePoint = ringPoint(GATE_ANGLE, RING.radius + 1.8)
  const socketPoint = ringPoint(GATE_ANGLE, RING.radius)
  return {
    stone,
    gate: new THREE.Vector3(gatePoint.x, top, gatePoint.z),
    socket: new THREE.Vector3(socketPoint.x, top + RING.gateHeight - 1.15, socketPoint.z),
    barrier,
    setAwake(level) {
      const t = THREE.MathUtils.clamp(level, 0, 1)
      m.core.emissiveIntensity = THREE.MathUtils.lerp(0.7, 7, t)
      crown.emissiveIntensity = THREE.MathUtils.lerp(1.2, 6, t)
    },
  }
}

/** Two round tiers with glyph inlays and the Listening Stone: an octagonal pedestal ringed with light. */
function buildSummit(collision: Collision, batch: Batch, m: Materials, top: number) {
  for (const tier of TIERS) {
    batch.add(m.stone, new THREE.CylinderGeometry(tier.radius, tier.radius + 0.15, tier.height + 1, 24), SPIRE.x, top + (tier.height - 1) / 2, SPIRE.z)
    batch.add(m.glyph, new THREE.TorusGeometry(tier.radius - 0.4, 0.05, 4, 48), SPIRE.x, top + tier.height + 0.005, SPIRE.z, { x: Math.PI / 2 })
    collision.addCylinder(SPIRE.x, SPIRE.z, tier.radius - 0.1, top - 1, top + tier.height)
  }
  const base = top + TIERS[1].height
  batch.add(m.dark, new THREE.CylinderGeometry(STONE.radius * 0.78, STONE.radius, STONE.height, 8), SPIRE.x, base + STONE.height / 2, SPIRE.z, {
    y: Math.PI / 8,
  })
  batch.add(m.glyph, new THREE.TorusGeometry(STONE.radius * 0.86, 0.05, 4, 8), SPIRE.x, base + STONE.height - 0.16, SPIRE.z, {
    z: Math.PI / 8,
    x: Math.PI / 2,
  })
  // Four sight lines inlaid in the upper tier, pointing at the Stone.
  for (let i = 0; i < 4; i++) {
    const angle = GATE_ANGLE + (i * Math.PI) / 2
    const p = ringPoint(angle, (STONE.radius + TIERS[1].radius) / 2 + 0.2)
    batch.add(m.glyph, new THREE.BoxGeometry(0.12, 0.04, TIERS[1].radius - STONE.radius - 1.2), p.x, base + 0.005, p.z, { y: facing(angle) })
  }
  collision.addCylinder(SPIRE.x, SPIRE.z, STONE.radius, base - 0.2, base + STONE.height)
}

/** Three tapering vanes leaning inward, glyph bars on their inner faces; the one behind the Stone has snapped. */
function buildVanes(collision: Collision, batch: Batch, m: Materials, top: number) {
  for (let i = 0; i < 3; i++) {
    const angle = GATE_ANGLE + Math.PI / 3 + (i * Math.PI * 2) / 3
    const broken = i === 1
    const height = broken ? VANES.broken : VANES.height
    const taper = broken ? 1 - (1 - 0.22) * (VANES.broken / VANES.height) : 0.22
    const p = ringPoint(angle, VANES.radius)
    // Vane-local frame: base at the origin, inner face toward −x; rotateZ leans it in, rotateY aims −x at the Stone.
    const rotation = { z: VANES.lean, y: -angle }
    batch.add(m.stone, block(VANES.width, height, VANES.depth, taper), p.x, top - 0.6, p.z, rotation)
    if (broken) {
      const cap = new THREE.BoxGeometry(VANES.width * taper * 1.1, 0.9, VANES.depth * taper * 1.2).rotateZ(0.5)
      batch.add(m.dark, cap.translate(0.15, height, 0), p.x, top - 0.6, p.z, rotation)
    }
    const bars: THREE.BufferGeometry[] = []
    for (let y = 3; y < height - 2; y += 2.6) {
      const half = (VANES.width / 2) * (1 - (1 - 0.22) * (y / VANES.height))
      bars.push(new THREE.BoxGeometry(0.05, 1.1, 0.34).translate(-half - 0.03, y, 0))
    }
    batch.add(m.glyph, mergeParts(bars, 'spire.vaneGlyphs'), p.x, top - 0.6, p.z, rotation)
    collision.addCylinder(p.x, p.z, VANES.width / 2 + 0.05, top - 1, top + 5)
  }
}

/** The ring of pylons (taller pair and a sealed lintel at the gate) and the curtain panels between them. */
function buildBarrier(scene: THREE.Scene, collision: Collision, batch: Batch, m: Materials, top: number): SpireBarrier {
  const step = (Math.PI * 2) / RING.count
  const chord = 2 * RING.radius * Math.sin(step / 2)
  const inner = RING.radius * Math.cos(step / 2)
  for (let i = 0; i < RING.count; i++) {
    const angle = GATE_ANGLE + (i + 0.5) * step
    const gate = i === 0 || i === RING.count - 1
    const height = gate ? RING.gateHeight : RING.height
    const p = ringPoint(angle, RING.radius)
    batch.add(m.stone, block(RING.pylon, height + 0.6, RING.pylon, 0.82), p.x, top - 0.6, p.z, { y: facing(angle) })
    batch.add(m.dark, block(RING.pylon * 1.05, 0.3, RING.pylon * 1.05), p.x, top + height - 0.05, p.z, { y: facing(angle) })
    const band = ringPoint(angle, RING.radius + RING.pylon * 0.4 + 0.02)
    batch.add(gate ? m.seal : m.glyph, new THREE.BoxGeometry(0.42, 0.08, 0.04), band.x, top + height - 0.6, band.z, { y: facing(angle) })
    collision.addCylinder(p.x, p.z, RING.pylon * 0.55, top - 0.6, top + height)
  }

  // Lintel over the gate with the Heart's sigil on its outer face.
  const lintel = ringPoint(GATE_ANGLE, inner)
  batch.add(m.stone, block(chord + 1.2, 0.7, 1), lintel.x, top + RING.gateHeight, lintel.z, { y: facing(GATE_ANGLE) })
  const sigil = ringPoint(GATE_ANGLE, inner + 0.52)
  batch.add(m.seal, new THREE.TorusGeometry(0.42, 0.05, 4, 24), sigil.x, top + RING.gateHeight + 0.35, sigil.z, { y: facing(GATE_ANGLE) })
  batch.add(m.seal, gem(0.2), sigil.x, top + RING.gateHeight + 0.35, sigil.z, { y: facing(GATE_ANGLE) })

  const panels: THREE.BufferGeometry[] = []
  const colliders: BoxCollider[] = []
  for (let i = 0; i < RING.count; i++) {
    const angle = GATE_ANGLE + i * step
    const p = ringPoint(angle, inner)
    const panel = new THREE.PlaneGeometry(chord - 0.5, RING.panel)
    panel.rotateY(facing(angle))
    panel.translate(p.x, top + RING.panel / 2 + 0.02, p.z)
    panels.push(panel)
    colliders.push(collision.addBox(p.x, p.z, chord / 2, 0.2, facing(angle), top - 0.6, top + RING.panel))
  }
  const material = new THREE.ShaderMaterial({
    name: 'spire.barrier',
    vertexShader: BARRIER_VERTEX,
    fragmentShader: BARRIER_FRAGMENT,
    uniforms: {
      uEchoTime: sharedUniforms.uEchoTime,
      uEchoNoise: sharedUniforms.uEchoNoise,
      uColor: { value: new THREE.Color(SEAL).multiplyScalar(0.6) },
      uOpen: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
  const curtain = new THREE.Mesh(mergeParts(panels, 'spire.barrier'), material)
  curtain.name = 'spire.barrier'
  curtain.renderOrder = 2
  scene.add(curtain)
  return new SpireBarrier(curtain, material, colliders, m.seal)
}

/** Waystones along the ramp's outer edge and a ruined gate at its foot. */
function buildRamp(collision: Collision, batch: Batch, m: Materials) {
  const { halfWidth } = SPIRE.ramp
  for (let i = 0; i < 7; i++) {
    const p = rampPoint(0.08 + i * 0.135, halfWidth + 0.45)
    const ground = collision.groundHeight(p.x, p.z)
    batch.add(m.dark, block(0.55, 1.9, 0.55, 0.78), p.x, ground - 0.4, p.z, { y: facing(p.angle) })
    batch.add(m.glyph, gem(0.16), p.x, ground + 1.72, p.z)
    collision.addCylinder(p.x, p.z, 0.34, ground - 0.4, ground + 1.5)
  }
  for (const side of [-1, 1]) {
    const p = rampPoint(0.02, side * (halfWidth + 0.9))
    const ground = collision.groundHeight(p.x, p.z)
    const height = side < 0 ? 5.4 : 3.1
    batch.add(m.stone, block(1, height + 0.6, 1, 0.85), p.x, ground - 0.6, p.z, { y: facing(p.angle) })
    batch.add(m.glyph, new THREE.BoxGeometry(1.06, 0.08, 1.06), p.x, ground + height - 0.7, p.z, { y: facing(p.angle) })
    collision.addCylinder(p.x, p.z, 0.6, ground - 0.6, ground + height)
  }
  // The foot gate's lintel lies broken beside the ramp, downhill.
  const fallen = rampPoint(0.035, halfWidth + 3.2)
  const ground = collision.groundHeight(fallen.x, fallen.z)
  batch.add(m.stone, block(4.6, 0.7, 0.9), fallen.x, ground - 0.15, fallen.z, { y: facing(fallen.angle) + 1.2, z: 0.12 })
  collision.addBox(fallen.x, fallen.z, 2.3, 0.45, facing(fallen.angle) + 1.2, ground - 0.2, ground + 0.6)
}

/** The Stone's floating core with two counter-turning rings, and the crown rings where the vane tips gather. */
function buildCrown(
  scene: THREE.Scene,
  m: Materials,
  top: number,
  stone: THREE.Vector3,
  animate: (animator: Animator) => void,
): THREE.MeshStandardMaterial {
  const crownMaterial = createEnergyMaterial(GLOW, 1.2)
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), m.core)
  core.scale.set(1, 1.5, 1)
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 4, 32), m.glyph)
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 4, 32), m.glyph)
  const heart = new THREE.Group()
  heart.name = 'spire.stoneCore'
  heart.position.set(stone.x, stone.y + 0.95, stone.z)
  heart.add(core, ringA, ringB)

  const crown = new THREE.Group()
  crown.name = 'spire.crown'
  crown.position.set(SPIRE.x, top + CROWN_HEIGHT, SPIRE.z)
  const outer = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.12, 6, 64), crownMaterial)
  const inner = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.08, 6, 48), crownMaterial)
  outer.rotation.x = inner.rotation.x = Math.PI / 2
  inner.position.y = -1.6
  crown.add(outer, inner)
  scene.add(heart, crown)

  const restY = heart.position.y
  animate((dt, time) => {
    heart.position.y = restY + Math.sin(time * 1.1) * 0.08
    core.rotation.y += dt * 0.6
    ringA.rotation.x += dt * 0.8
    ringB.rotation.y += dt * 1.1
    crown.rotation.y += dt * 0.12
    inner.rotation.z -= dt * 0.3
    crown.position.y = top + CROWN_HEIGHT + Math.sin(time * 0.4) * 0.3
  })
  return crownMaterial
}

/** Memory: the whole Spire (all vanes, a tall needle and the great listening crown) and the last ascent of the choir. */
function buildSpireEchoes({ scene, collision, reactives }: StructureContext, top: number) {
  const past = new THREE.Group()
  past.name = 'spire.past'
  for (let i = 0; i < 6; i++) {
    const angle = GATE_ANGLE + Math.PI / 3 + (i * Math.PI) / 3
    // The lost vanes between the standing ones, and the snapped one whole (i = 2 is behind the Stone).
    if (i % 2 === 0 && i !== 2) continue
    const p = ringPoint(angle, VANES.radius)
    const vane = new THREE.Mesh(block(VANES.width, VANES.height * 1.25, VANES.depth, 0.15))
    vane.position.set(p.x, top - 0.6, p.z)
    vane.rotation.set(0, -angle, VANES.lean, 'YXZ')
    past.add(vane)
  }
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.5, 30, 8))
  needle.position.set(SPIRE.x, top + 4 + 15, SPIRE.z)
  past.add(needle)
  for (const [radius, y] of [
    [8.5, 33],
    [5.5, 30],
    [3.2, 27.5],
  ]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.22, 6, 64))
    ring.position.set(SPIRE.x, top + y, SPIRE.z)
    ring.rotation.x = Math.PI / 2
    past.add(ring)
  }
  reactives.add(new PastStateOverlay(scene, past))

  const heightAt = (x: number, z: number) => {
    const r = Math.hypot(x - SPIRE.x, z - SPIRE.z)
    for (let i = TIERS.length - 1; i >= 0; i--) if (r < TIERS[i].radius) return top + TIERS[i].height
    return collision.groundHeight(x, z)
  }
  const ramp = (s: number, offset = 0): [number, number] => {
    const p = rampPoint(s, offset)
    return [p.x, p.z]
  }
  const atStone = (angle: number, radius: number): [number, number] => {
    const p = ringPoint(angle, radius)
    return [p.x, p.z]
  }
  reactives.add(
    new GhostScene(
      scene,
      [
        { path: [ramp(0.9, 0.6), ramp(1), atStone(GATE_ANGLE, 6)], speed: 1.1 },
        { path: [ramp(0.86, -0.7), ramp(0.97, -0.5), atStone(GATE_ANGLE + 0.12, 7.4)], speed: 1, delay: 1.4 },
        { path: [atStone(GATE_ANGLE, 2.2)], pose: 'kneel', lookAt: [SPIRE.x, SPIRE.z] },
        { path: [atStone(GATE_ANGLE + 2.1, 3.6)], pose: 'sing', lookAt: [SPIRE.x, SPIRE.z] },
        { path: [atStone(GATE_ANGLE - 2.1, 3.6)], pose: 'sing', lookAt: [SPIRE.x, SPIRE.z], scale: 0.94 },
      ],
      heightAt,
      'spire.ascent',
    ),
  )
  for (const [angle, seed] of [
    [GATE_ANGLE + 1.15, 41],
    [GATE_ANGLE - 1.6, 43],
  ]) {
    const p = ringPoint(angle, 13.6)
    reactives.add(new CrystalCluster(scene, collision, { x: p.x, z: p.z, count: 5, spread: 1.3, seed, size: 0.8 }))
  }
}
