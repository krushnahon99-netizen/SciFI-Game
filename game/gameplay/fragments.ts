import * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import { RevealTimer, type PulseInfo, type Reactive, type ReactiveRegistry } from '../echo/reactive'
import type { Collision } from '../physics/collision'
import { sharedUniforms } from '../render/shaderChunks'
import { FRAGMENT_SPOTS } from '../world/layout'
import { createEnergyMaterial, createStoneMaterial } from '../world/materials'
import { FRAGMENTS, FRAGMENT_IDS, PROMPTS } from './content'
import type { FragmentId, ProgressView } from './ids'
import type { Interactable, Interactables } from './interactables'

const FRAGMENT = {
  reach: 2.2,
  /** Shard centre above the ground (on a plinth) / above the ground for pulse-only fragments (no plinth). */
  hover: 1.4,
  hoverPulseOnly: 1.2,
  plinthHeight: 0.9,
  plinthRadius: 0.4,
  beamHeight: 7,
  beamRadius: 0.24,
  /** Beam brightness on its axis (additive; bloom on Medium+ widens it). */
  beamIntensity: 0.3,
  shardIntensity: 2.6,
  /** Extra shard glow right after the wavefront reveals a pulse-only fragment. */
  flare: 4,
  flareSeconds: 1.6,
  collectSeconds: 1.5,
  /** A pulse-only fragment stays visible (and usable) for `hold` seconds after the wavefront passes. */
  reveal: { hold: 16, fadeIn: 0.9, fadeOut: 2.5 },
  usableAbove: 0.35,
}
const SHARD_COLOR = '#bff6ff'
const BEAM_COLOR = '#6fdcff'
const INLAY = { lit: 1.4, spent: 0.12 }

const BEAM_VERTEX = /* glsl */ `
varying vec3 vBeamWorld;
varying vec3 vBeamNormal;
varying float vBeamHeight;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vBeamWorld = world.xyz;
  vBeamNormal = normalize(mat3(modelMatrix) * normal);
  vBeamHeight = uv.y;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Additive light column: bright along its axis, fading upward, with slow rising bands. It never fades out
// completely with distance, so it works as a beacon across a region.
const BEAM_FRAGMENT = /* glsl */ `
uniform float uEchoTime;
uniform vec3 uColor;
uniform float uAmount;
varying vec3 vBeamWorld;
varying vec3 vBeamNormal;
varying float vBeamHeight;
void main() {
  vec3 toCamera = cameraPosition - vBeamWorld;
  float dist = length(toCamera);
  float facing = abs(dot(normalize(vBeamNormal.xz + 1e-5), normalize(toCamera.xz + 1e-5)));
  float core = pow(facing, 6.0);
  float rise = fract(vBeamHeight * 3.0 - uEchoTime * 0.35);
  float bands = 0.7 + 0.3 * smoothstep(0.0, 0.5, rise) * (1.0 - smoothstep(0.5, 1.0, rise));
  float fade = pow(1.0 - vBeamHeight, 1.8) * smoothstep(0.0, 0.05, vBeamHeight);
  float far = mix(1.0, 0.45, smoothstep(30.0, 200.0, dist));
  gl_FragColor = vec4(uColor * core * fade * bands * far * uAmount, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function createBeamMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'echo.fragmentBeam',
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
    uniforms: {
      uEchoTime: sharedUniforms.uEchoTime,
      uColor: { value: new THREE.Color(BEAM_COLOR) },
      uAmount: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

interface Shared {
  shard: THREE.BufferGeometry
  ring: THREE.BufferGeometry
  beam: THREE.BufferGeometry
  plinth: THREE.BufferGeometry
  inlay: THREE.BufferGeometry
  stone: THREE.Material
}

interface FragmentContext {
  scene: THREE.Scene
  collision: Collision
  events: Emitter<GameEvents>
  interactables: Interactables
}

/**
 * One memory fragment: a floating shard in two orbiting rings over a light column. Visible fragments rest on a small
 * glyph plinth; pulse-only ones float unseen until a pulse's wavefront reaches them, then stay usable for a while.
 * Recovering one (E) emits `fragmentFound` and plays a short lift-and-dissolve.
 */
class MemoryFragment implements Reactive, Interactable {
  readonly kind = 'trigger' as const
  readonly radius = 0.8
  readonly center: THREE.Vector3
  readonly reach = FRAGMENT.reach
  private readonly root = new THREE.Group()
  private readonly shard: THREE.Mesh
  private readonly rings: readonly THREE.Mesh[]
  private readonly shardMaterial: THREE.MeshStandardMaterial
  private readonly beamMaterial: THREE.ShaderMaterial
  private readonly inlayMaterial: THREE.MeshStandardMaterial | null
  private readonly revealTimer: RevealTimer | null
  private readonly seed: number
  private flareAt = -Infinity
  private foundAt = -Infinity
  private clock = 0
  private finished = false

  constructor(
    readonly id: FragmentId,
    private found: boolean,
    shared: Shared,
    private readonly context: FragmentContext,
  ) {
    const { x, z } = FRAGMENT_SPOTS[id]
    const { collision, scene } = context
    const pulseOnly = FRAGMENTS[id].pulseOnly
    const ground = Math.max(collision.groundHeight(x, z), collision.topAt(x, z))
    this.center = new THREE.Vector3(x, ground + (pulseOnly ? FRAGMENT.hoverPulseOnly : FRAGMENT.hover), z)
    this.seed = FRAGMENT_IDS.indexOf(id) * 1.7

    this.inlayMaterial = null
    if (!pulseOnly) {
      const plinth = new THREE.Mesh(shared.plinth, shared.stone)
      plinth.position.set(x, ground, z)
      plinth.rotation.y = this.seed
      plinth.castShadow = true
      plinth.receiveShadow = true
      this.inlayMaterial = createEnergyMaterial(BEAM_COLOR, found ? INLAY.spent : INLAY.lit)
      const inlay = new THREE.Mesh(shared.inlay, this.inlayMaterial)
      inlay.position.set(x, ground + FRAGMENT.plinthHeight + 0.005, z)
      scene.add(plinth, inlay)
      collision.addCylinder(x, z, FRAGMENT.plinthRadius, ground - 0.5, ground + FRAGMENT.plinthHeight)
    }

    this.shardMaterial = createEnergyMaterial(SHARD_COLOR, FRAGMENT.shardIntensity)
    this.beamMaterial = createBeamMaterial()
    this.shard = new THREE.Mesh(shared.shard, this.shardMaterial)
    this.rings = [0, 1].map((index) => {
      const ring = new THREE.Mesh(shared.ring, this.shardMaterial)
      ring.rotation.set(index === 0 ? 1.15 : -0.6, this.seed, index === 0 ? 0.3 : 1.2)
      return ring
    })
    const beam = new THREE.Mesh(shared.beam, this.beamMaterial)
    const beamFoot = pulseOnly ? -FRAGMENT.hoverPulseOnly : FRAGMENT.plinthHeight - FRAGMENT.hover
    beam.position.y = beamFoot + FRAGMENT.beamHeight / 2
    beam.renderOrder = 2
    this.root.add(this.shard, ...this.rings, beam)
    this.root.position.copy(this.center)
    scene.add(this.root)

    this.revealTimer = pulseOnly ? new RevealTimer(FRAGMENT.reveal.hold, FRAGMENT.reveal.fadeIn, FRAGMENT.reveal.fadeOut) : null
    if (found) {
      this.root.visible = false
      this.finished = true
    } else if (pulseOnly) {
      this.root.visible = false
    }
  }

  get recovered(): boolean {
    return this.found
  }

  /** Interact anchor: the shard's rest centre. */
  get position(): THREE.Vector3 {
    return this.center
  }

  /** The wavefront reached a pulse-only fragment: show it (later pulses extend the showing). */
  hit(_pulse: PulseInfo, arrival: number) {
    if (this.found || !this.revealTimer) return
    if (this.revealTimer.trigger(arrival)) this.flareAt = arrival
  }

  prompt(): string | null {
    if (this.found) return null
    if (this.revealTimer && this.revealTimer.amount(this.clock) < FRAGMENT.usableAbove) return null
    return PROMPTS.recoverMemory
  }

  interact() {
    if (this.found) return
    this.found = true
    this.foundAt = this.clock
    this.flareAt = this.clock
    this.context.interactables.remove(this)
    if (this.inlayMaterial) this.inlayMaterial.emissiveIntensity = INLAY.spent
    this.context.events.emit('fragmentFound', { id: this.id })
  }

  /**
   * `clock` = echo play clock (reveal, recovery); `time` = wall clock (idle motion). Not named `update`: the reactive
   * registry would call that.
   */
  tick(clock: number, dt: number, time: number) {
    this.clock = clock
    if (this.finished) return
    const amount = this.revealTimer ? this.revealTimer.amount(clock) : 1
    const collect = this.found ? THREE.MathUtils.clamp((clock - this.foundAt) / FRAGMENT.collectSeconds, 0, 1) : 0
    if (collect >= 1) {
      this.root.visible = false
      this.finished = true
      return
    }
    this.root.visible = amount > 0.002
    if (!this.root.visible) return

    const appear = THREE.MathUtils.smoothstep(amount, 0, 1)
    const lift = collect * collect
    this.root.position.y = this.center.y + Math.sin(time * 1.4 + this.seed) * 0.07 + lift * 1.6
    this.shard.rotation.y += dt * (0.8 + collect * 9)
    this.shard.scale.setScalar(appear * (1 + collect * 0.6) * (1 - lift))
    this.rings[0].rotation.z += dt * 0.9
    this.rings[1].rotation.x += dt * 1.3
    const spread = appear * (1 + collect * 1.8)
    for (const ring of this.rings) ring.scale.setScalar(spread)

    const since = clock - this.flareAt
    const flare = since >= 0 && since < FRAGMENT.flareSeconds ? (1 - since / FRAGMENT.flareSeconds) ** 2 : 0
    this.shardMaterial.emissiveIntensity = (FRAGMENT.shardIntensity + flare * FRAGMENT.flare) * (1 - collect * 0.7)
    this.beamMaterial.uniforms.uAmount.value =
      FRAGMENT.beamIntensity * appear * (1 + flare + collect * 2) * (1 - collect) ** 2
  }
}

/**
 * The ten memory fragments (spots in layout `FRAGMENT_SPOTS`, text and `pulseOnly` flags in content.ts). Built once
 * after the World; fragments already in the save stay recovered (their plinth stays, dark).
 */
export class Fragments {
  readonly list: readonly MemoryFragment[]

  constructor(
    scene: THREE.Scene,
    collision: Collision,
    reactives: ReactiveRegistry,
    interactables: Interactables,
    events: Emitter<GameEvents>,
    progress: ProgressView,
  ) {
    const shared: Shared = {
      shard: new THREE.OctahedronGeometry(0.24).scale(1, 1.9, 1),
      ring: new THREE.TorusGeometry(0.48, 0.016, 6, 48),
      beam: new THREE.CylinderGeometry(FRAGMENT.beamRadius, FRAGMENT.beamRadius, FRAGMENT.beamHeight, 16, 1, true),
      plinth: new THREE.CylinderGeometry(0.3, FRAGMENT.plinthRadius, FRAGMENT.plinthHeight, 8).translate(
        0,
        FRAGMENT.plinthHeight / 2,
        0,
      ),
      inlay: new THREE.TorusGeometry(0.2, 0.022, 4, 32).rotateX(-Math.PI / 2),
      stone: createStoneMaterial('#7d7268'),
    }
    const context: FragmentContext = { scene, collision, events, interactables }
    this.list = FRAGMENT_IDS.map((id) => {
      const found = progress.has(id)
      const fragment = new MemoryFragment(id, found, shared, context)
      if (!found) {
        interactables.add(fragment)
        if (FRAGMENTS[id].pulseOnly) reactives.add(fragment)
      }
      return fragment
    })
  }

  update(clock: number, dt: number, time: number) {
    for (const fragment of this.list) fragment.tick(clock, dt, time)
  }
}
