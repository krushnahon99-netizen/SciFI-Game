import * as THREE from 'three'
import { patchWorldMaterial } from '../render/shaderChunks'
import { createEnergyMaterial } from '../world/materials'
import type { Player } from './player'

const HIP_HEIGHT = 0.95
const CORE_GLOW = 2.2
/** Extra backpack-core emissive at the moment of a pulse. */
const CORE_FLARE = 16
/** Flare fades over 1 / FLARE_DECAY seconds. */
const FLARE_DECAY = 1.4

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
const damp = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt))

function suitMaterial(color: THREE.ColorRepresentation, roughness: number, metalness = 0) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, metalness })
  material.name = 'echo.avatar'
  return patchWorldMaterial(material, { key: 'avatar', pulse: false })
}

interface Limb {
  upper: THREE.Group
  lower: THREE.Group
}

/** Procedural explorer: primitive-built suit with a glowing visor and backpack core, animated from the controller state. */
export class Avatar {
  readonly root = new THREE.Group()
  private readonly hips = new THREE.Group()
  private readonly spine = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly torso: THREE.Mesh
  private readonly legs: [Limb, Limb]
  private readonly arms: [Limb, Limb]
  private readonly materials: THREE.Material[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  /** Backpack core (own material so it can flare without the visor). */
  private readonly core: THREE.MeshStandardMaterial
  private flareLevel = 0
  private phase = 0
  private move = 0
  private run = 0
  private air = 0
  private land = 0
  private lean = 0

  constructor() {
    this.root.name = 'avatar'
    const suit = this.track(suitMaterial('#c9bba6', 0.82))
    const armor = this.track(suitMaterial('#3b3f48', 0.55, 0.35))
    const glow = this.track(createEnergyMaterial('#6ff3ff', CORE_GLOW))
    this.core = this.track(createEnergyMaterial('#6ff3ff', CORE_GLOW))

    this.hips.position.y = HIP_HEIGHT
    this.root.add(this.hips)
    this.part(this.hips, new THREE.SphereGeometry(0.17, 16, 10), armor, [0, 0, 0], [1, 0.75, 0.75])

    this.spine.position.y = 0.06
    this.hips.add(this.spine)
    this.torso = this.part(this.spine, new THREE.CapsuleGeometry(0.2, 0.3, 6, 14), suit, [0, 0.3, 0], [1.08, 1, 0.74])
    this.part(this.spine, new THREE.BoxGeometry(0.3, 0.17, 0.07), armor, [0, 0.4, -0.13])
    this.part(this.spine, new THREE.BoxGeometry(0.34, 0.42, 0.16), armor, [0, 0.33, 0.17])
    this.part(this.spine, new THREE.CylinderGeometry(0.045, 0.045, 0.3, 12), this.core, [0, 0.33, 0.26])
    this.part(this.spine, new THREE.TorusGeometry(0.13, 0.035, 8, 20), armor, [0, 0.6, 0], [1, 1, 1], [Math.PI / 2, 0, 0])

    this.head.position.y = 0.72
    this.spine.add(this.head)
    this.part(this.head, new THREE.SphereGeometry(0.15, 20, 14), suit, [0, 0, 0], [0.95, 1.05, 1])
    this.part(this.head, new THREE.CapsuleGeometry(0.05, 0.15, 4, 10), glow, [0, 0.01, -0.12], [1, 1, 0.6], [0, 0, Math.PI / 2])
    this.part(this.head, new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), armor, [0.09, 0.15, 0.06], [1, 1, 1], [0.35, 0, -0.25])

    this.arms = [this.limb(this.spine, -1, suit, armor, true), this.limb(this.spine, 1, suit, armor, true)]
    this.legs = [this.limb(this.hips, -1, suit, armor, false), this.limb(this.hips, 1, suit, armor, false)]

    this.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true
        object.receiveShadow = true
      }
    })
  }

  update(dt: number, player: Player, time: number) {
    this.root.position.copy(player.position)
    this.root.rotation.y = player.facing
    if (dt <= 0) return

    const speed = player.grounded ? player.horizontalSpeed : 0
    this.move = damp(this.move, smooth(0.15, 1.6, speed), 10, dt)
    this.run = damp(this.run, smooth(4.8, 7.6, speed), 6, dt)
    this.air = damp(this.air, player.grounded ? 0 : smooth(0.05, 0.25, player.airTime), 12, dt)
    if (player.landingSpeed > 2) this.land = Math.min(1, player.landingSpeed / 12)
    this.land = damp(this.land, 0, 7, dt)
    this.lean = damp(this.lean, THREE.MathUtils.clamp(-player.turnRate * player.horizontalSpeed * 0.02, -0.28, 0.28), 8, dt)
    this.flareLevel = Math.max(0, this.flareLevel - dt * FLARE_DECAY)
    const release = this.flareLevel * this.flareLevel
    this.core.emissiveIntensity = CORE_GLOW + CORE_FLARE * release

    const stride = THREE.MathUtils.lerp(1.05, 1.5, this.run)
    this.phase += ((speed * dt) / stride) * Math.PI
    const s = Math.sin(this.phase)
    const c = Math.cos(this.phase)
    const swing = (0.5 + 0.38 * this.run) * this.move
    const ground = 1 - this.air
    const breathe = Math.sin(time * 1.9) * (1 - this.move)

    this.hips.position.y = HIP_HEIGHT - Math.abs(s) * (0.03 + 0.04 * this.run) * this.move - 0.16 * this.land + 0.012 * breathe
    this.hips.rotation.z = this.lean
    this.hips.rotation.y = s * 0.1 * this.move
    this.spine.rotation.y = -s * 0.16 * this.move
    this.spine.rotation.x =
      -(0.05 * this.move + 0.2 * this.run) * ground - 0.12 * this.air + 0.18 * this.land - 0.14 * release
    this.torso.scale.y = 1 + 0.02 * breathe
    this.head.rotation.x = -this.spine.rotation.x * 0.6
    this.head.rotation.y = Math.sin(time * 0.37) * 0.15 * (1 - this.move)

    for (let side = 0; side < 2; side++) {
      const dir = side === 0 ? 1 : -1
      const leg = this.legs[side]
      const legSwing = dir * s * swing
      leg.upper.rotation.x = legSwing * ground + this.air * (side === 0 ? 0.65 : -0.2) + 0.5 * this.land
      leg.lower.rotation.x =
        -(Math.max(0, dir * -c) * (0.55 + 0.65 * this.run) * this.move + 0.06) * ground -
        this.air * (side === 0 ? 1.1 : 0.45) -
        0.9 * this.land

      const arm = this.arms[side]
      arm.upper.rotation.x = -legSwing * 0.85 * ground - 0.35 * this.air
      arm.upper.rotation.z = -dir * (0.08 + 0.55 * this.air + 0.1 * this.run + 0.45 * release)
      arm.lower.rotation.x = (0.18 + 0.35 * this.move + 0.55 * this.run) * ground + 0.6 * this.air
    }
  }

  /** Backpack core flare + a brief arms-out release pose (call when a pulse fires). */
  flare() {
    this.flareLevel = 1
  }

  dispose() {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
    this.root.removeFromParent()
  }

  private track<T extends THREE.Material>(material: T): T {
    this.materials.push(material)
    return material
  }

  private part(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: [number, number, number],
    scale: [number, number, number] = [1, 1, 1],
    rotation: [number, number, number] = [0, 0, 0],
  ): THREE.Mesh {
    this.geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.rotation.set(...rotation)
    parent.add(mesh)
    return mesh
  }

  /** Arm (pivot at the shoulder) or leg (pivot at the hip); `side` −1 = left, 1 = right. */
  private limb(parent: THREE.Object3D, side: number, suit: THREE.Material, armor: THREE.Material, arm: boolean): Limb {
    const upper = new THREE.Group()
    const lower = new THREE.Group()
    if (arm) {
      upper.position.set(side * 0.27, 0.52, 0)
      this.part(upper, new THREE.SphereGeometry(0.085, 12, 8), armor, [0, 0, 0])
      this.part(upper, new THREE.CapsuleGeometry(0.058, 0.2, 4, 10), suit, [0, -0.15, 0])
      lower.position.y = -0.3
      this.part(lower, new THREE.CapsuleGeometry(0.052, 0.18, 4, 10), armor, [0, -0.12, 0])
      this.part(lower, new THREE.SphereGeometry(0.058, 10, 8), suit, [0, -0.27, 0])
    } else {
      upper.position.set(side * 0.1, -0.03, 0)
      this.part(upper, new THREE.CapsuleGeometry(0.08, 0.28, 4, 10), suit, [0, -0.2, 0])
      lower.position.y = -0.42
      this.part(lower, new THREE.CapsuleGeometry(0.068, 0.28, 4, 10), suit, [0, -0.2, 0])
      this.part(lower, new THREE.BoxGeometry(0.12, 0.08, 0.25), armor, [0, -0.46, -0.04])
      this.part(lower, new THREE.SphereGeometry(0.075, 10, 8), armor, [0, 0, -0.02], [1, 1, 0.8])
    }
    upper.add(lower)
    parent.add(upper)
    return { upper, lower }
  }
}
