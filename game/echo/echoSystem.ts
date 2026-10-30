import * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import { sharedUniforms } from '../render/shaderChunks'
import { uiStore } from '../ui/store'
import { PULSE_DURATION, PULSE_INACTIVE, PULSE_SLOTS, PULSE_SPEED } from './pulseShader'

/** Seconds between pulses. */
export const PULSE_COOLDOWN = 2.5
/** The HUD charge ring gets at most this many store updates per cooldown and tweens between them. */
const CHARGE_STEPS = 24

const SHELL_VERTEX = /* glsl */ `
varying vec3 vShellWorld;
varying vec3 vShellNormal;
varying vec2 vShellUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vShellWorld = world.xyz;
  vShellNormal = normalize(mat3(modelMatrix) * normal);
  vShellUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

// Additive: a fresnel rim plus a ~10 m tall wall around the emitter's height, broken up by drifting streaks.
const SHELL_FRAGMENT = /* glsl */ `
uniform sampler2D uEchoNoise;
uniform vec3 uOrigin;
uniform float uAge;
uniform float uLife;
varying vec3 vShellWorld;
varying vec3 vShellNormal;
varying vec2 vShellUv;
void main() {
  vec3 toCamera = normalize(cameraPosition - vShellWorld);
  float rim = pow(1.0 - abs(dot(normalize(vShellNormal), toCamera)), 3.0);
  float h = vShellWorld.y - uOrigin.y;
  float wall = exp(-h * h * 0.02);
  float streak = smoothstep(0.3, 0.75, texture(uEchoNoise, vec2(vShellUv.x * 6.0, vShellUv.y * 2.0 - uAge * 0.6)).r);
  float glow = (0.5 * rim + 0.45 * wall) * (0.35 + 1.1 * streak) * uLife;
  gl_FragColor = vec4(vec3(0.32, 0.86, 1.0) * glow, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * The echo pulse, timed on a play clock that freezes while paused. Surface effects come from `uEchoPulses` in every
 * patched world material (pulseShader.ts); this class owns the slots, the cooldown, the airborne shell meshes and
 * the `pulse` event that reactive objects listen to.
 */
export class EchoSystem {
  private clockSeconds = 0
  private cooldown = 0
  private nextSlot = 0
  private publishedSteps = -1
  private readonly pulses = sharedUniforms.uEchoPulses.value
  private readonly shellGeometry = new THREE.SphereGeometry(1, 48, 24)
  private readonly shells: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>[] = []

  constructor(
    scene: THREE.Scene,
    private readonly events: Emitter<GameEvents>,
  ) {
    for (const pulse of this.pulses) pulse.set(0, 0, 0, PULSE_INACTIVE)
    sharedUniforms.uEchoClock.value = 0
    for (let slot = 0; slot < PULSE_SLOTS; slot++) {
      const material = new THREE.ShaderMaterial({
        name: 'echo.pulseShell',
        vertexShader: SHELL_VERTEX,
        fragmentShader: SHELL_FRAGMENT,
        uniforms: {
          uEchoNoise: sharedUniforms.uEchoNoise,
          uOrigin: { value: new THREE.Vector3() },
          uAge: { value: 0 },
          uLife: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
      const shell = new THREE.Mesh(this.shellGeometry, material)
      shell.name = `echo.pulseShell.${slot}`
      shell.visible = false
      shell.renderOrder = 10
      this.shells.push(shell)
      scene.add(shell)
    }
    this.publishCharge()
  }

  /** Play-time seconds the pulses are timed on (the `time` in `pulse` events). */
  get clock(): number {
    return this.clockSeconds
  }

  /** 0 right after a pulse … 1 when the next one is ready. */
  get charge(): number {
    return 1 - this.cooldown / PULSE_COOLDOWN
  }

  /** Sends a pulse from `origin` if charged; returns whether it fired. */
  trigger(origin: THREE.Vector3): boolean {
    if (this.cooldown > 0) return false
    const slot = this.nextSlot
    this.nextSlot = (slot + 1) % PULSE_SLOTS
    this.pulses[slot].set(origin.x, origin.y, origin.z, this.clockSeconds)
    this.cooldown = PULSE_COOLDOWN
    this.publishCharge()
    this.events.emit('pulse', { origin: { x: origin.x, y: origin.y, z: origin.z }, time: this.clockSeconds, slot })
    return true
  }

  /** `dt` is play time: pass 0 while paused so pulses and the cooldown freeze. */
  update(dt: number) {
    this.clockSeconds += dt
    sharedUniforms.uEchoClock.value = this.clockSeconds
    this.cooldown = Math.max(0, this.cooldown - dt)
    for (let slot = 0; slot < PULSE_SLOTS; slot++) {
      const pulse = this.pulses[slot]
      const shell = this.shells[slot]
      const age = this.clockSeconds - pulse.w
      const life =
        age < 0 || age > PULSE_DURATION
          ? 0
          : THREE.MathUtils.smoothstep(age, 0, 0.06) * (1 - THREE.MathUtils.smoothstep(age / PULSE_DURATION, 0.35, 1))
      shell.visible = life > 0.002
      if (!shell.visible) continue
      shell.position.set(pulse.x, pulse.y, pulse.z)
      shell.scale.setScalar(Math.max(0.05, age * PULSE_SPEED))
      const uniforms = shell.material.uniforms
      uniforms.uOrigin.value.copy(shell.position)
      uniforms.uAge.value = age
      uniforms.uLife.value = life
    }
    this.publishCharge()
  }

  dispose() {
    for (const shell of this.shells) {
      shell.removeFromParent()
      shell.material.dispose()
    }
    this.shells.length = 0
    this.shellGeometry.dispose()
    for (const pulse of this.pulses) pulse.set(0, 0, 0, PULSE_INACTIVE)
  }

  private publishCharge() {
    const steps = Math.floor(this.charge * CHARGE_STEPS)
    if (steps === this.publishedSteps) return
    this.publishedSteps = steps
    uiStore.setState({ pulseCharge: steps / CHARGE_STEPS })
  }
}
