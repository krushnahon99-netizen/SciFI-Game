import * as THREE from 'three'
import type { Collider, Collision } from '../physics/collision'
import { sharedUniforms } from '../render/shaderChunks'
import { SUN_DIRECTION } from '../world/layout'
import { RevealTimer, type PulseInfo, type Reactive } from './reactive'

/** Seconds a phase object stays solid after the wavefront reaches it. */
export const PHASE_HOLD = 7
/** The last seconds of the hold flicker as a warning. */
const PHASE_WARNING = 1.6

const f = (n: number) => n.toFixed(5)

const PHASE_VERTEX = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vPhaseWorld;
varying vec3 vPhaseNormal;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPhaseWorld = world.xyz;
  vPhaseNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

// uPhase 0 = out of phase (a faint fresnel shimmer a sharp eye can spot), 1 = solid glassy stone with glowing seams.
const PHASE_FRAGMENT = /* glsl */ `
#include <fog_pars_fragment>
uniform float uEchoTime;
uniform sampler2D uEchoNoise;
uniform float uPhase;
varying vec3 vPhaseWorld;
varying vec3 vPhaseNormal;
const vec3 PHASE_SUN = vec3(${f(SUN_DIRECTION.x)}, ${f(SUN_DIRECTION.y)}, ${f(SUN_DIRECTION.z)});
void main() {
  vec3 n = normalize(vPhaseNormal);
  float fresnel = pow(1.0 - abs(dot(n, normalize(cameraPosition - vPhaseWorld))), 3.0);
  vec3 an = abs(n);
  vec2 plane = an.y > 0.6 ? vPhaseWorld.xz : (an.x > an.z ? vPhaseWorld.zy : vPhaseWorld.xy);
  float grain = texture(uEchoNoise, plane * 0.4).g;
  vec2 cell = abs(fract(plane * 0.9 + grain * 0.3) - 0.5);
  float seam = 1.0 - smoothstep(0.02, 0.07, min(cell.x, cell.y));
  float light = 0.45 + 0.75 * max(dot(n, PHASE_SUN), 0.0);
  vec3 solid = vec3(0.05, 0.11, 0.14) * light * (0.75 + 0.5 * grain) + vec3(0.22, 0.78, 1.0) * (fresnel * 1.1 + seam * 0.6);
  float shimmer = fresnel * (0.04 + 0.04 * sin(uEchoTime * 2.6 + vPhaseWorld.y * 3.0 + vPhaseWorld.x * 0.7));
  gl_FragColor = vec4(mix(vec3(0.3, 0.8, 1.0), solid, uPhase), mix(shimmer, 0.92, uPhase));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

function createPhaseMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'echo.phase',
    vertexShader: PHASE_VERTEX,
    fragmentShader: PHASE_FRAGMENT,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uEchoTime: sharedUniforms.uEchoTime,
      uEchoNoise: sharedUniforms.uEchoNoise,
      uPhase: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    fog: true,
  })
}

export interface PhasePart {
  geometry: THREE.BufferGeometry
  position: { x: number; y: number; z: number }
  yaw?: number
  /** Walkable collider in world y: a cylinder (`radius`) or a box yawed like the mesh (`halfX`/`halfZ`). */
  collider: { radius: number; bottom: number; top: number } | { halfX: number; halfZ: number; bottom: number; top: number }
}

/**
 * Exists between two states of reality: out of phase (intangible, barely visible) until a pulse reaches it, then
 * solid for PHASE_HOLD seconds, flickering before it slips away again. `stabilize()` makes it permanent.
 */
export class PhaseObject implements Reactive {
  readonly kind = 'phase' as const
  readonly center = new THREE.Vector3()
  readonly radius: number
  private readonly root = new THREE.Group()
  private readonly material = createPhaseMaterial()
  private readonly colliders: Collider[] = []
  private readonly timer = new RevealTimer(PHASE_HOLD, 0.35, 0.45)
  private stable = false
  private solid = false
  private warned = false
  /** Set by the ReactiveRegistry (emits `phaseWarn`); called each time the expiry flicker starts. */
  onWarn: ((center: THREE.Vector3) => void) | null = null

  constructor(scene: THREE.Scene, collision: Collision, parts: readonly PhasePart[], name = 'echo.phase') {
    for (const part of parts) {
      const mesh = new THREE.Mesh(part.geometry, this.material)
      mesh.position.set(part.position.x, part.position.y, part.position.z)
      mesh.rotation.y = part.yaw ?? 0
      this.root.add(mesh)
      const c = part.collider
      const collider =
        'radius' in c
          ? collision.addCylinder(part.position.x, part.position.z, c.radius, c.bottom, c.top)
          : collision.addBox(part.position.x, part.position.z, c.halfX, c.halfZ, part.yaw ?? 0, c.bottom, c.top)
      collider.enabled = false
      this.colliders.push(collider)
    }
    this.root.name = name
    this.root.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(this.root)
    bounds.getCenter(this.center)
    this.radius = bounds.getSize(new THREE.Vector3()).length() / 2
    scene.add(this.root)
  }

  get isSolid(): boolean {
    return this.solid
  }

  get isStable(): boolean {
    return this.stable
  }

  /** Locks the object in the present (e.g. the Glass Bridge once crossed). */
  stabilize() {
    this.stable = true
    this.setSolid(true)
    this.material.uniforms.uPhase.value = 1
    this.material.depthWrite = true
  }

  hit(_pulse: PulseInfo, arrival: number) {
    if (!this.stable) this.timer.trigger(arrival)
  }

  update(clock: number): boolean {
    if (this.stable) return false
    const left = this.timer.until - clock
    const warning = left > 0 && left < PHASE_WARNING
    if (warning !== this.warned) {
      this.warned = warning
      if (warning) this.onWarn?.(this.center)
    }
    const flicker = warning && Math.sin(clock * (14 + (PHASE_WARNING - left) * 16)) < -0.3 ? 0.25 : 1
    const done = this.timer.done(clock)
    const phase = done ? 0 : this.timer.amount(clock) * flicker
    this.material.uniforms.uPhase.value = phase
    this.material.depthWrite = phase > 0.5
    this.setSolid(!done && clock >= this.timer.start && clock <= this.timer.until)
    return !done
  }

  private setSolid(solid: boolean) {
    if (solid === this.solid) return
    this.solid = solid
    for (const collider of this.colliders) collider.enabled = solid
  }
}
