import * as THREE from 'three'
import type { QualitySettings } from '../render/quality'

/** Unit vector from the world towards the low, dying amber sun. */
export const SUN_DIRECTION = new THREE.Vector3(-0.45, 0.26, -0.85).normalize()
const SUN_DISTANCE = 220

type Animator = (dt: number, time: number) => void

/** Assembles the environment and owns global lighting (sun + sky fill) and the player-following shadow frustum. */
export class World {
  readonly sun = new THREE.DirectionalLight('#ffb37e', 3.2)
  readonly hemi = new THREE.HemisphereLight('#8090c0', '#3b2c25', 0.85)

  private readonly sunTarget = new THREE.Object3D()
  private readonly animators: Animator[] = []
  private shadowRadius = 40
  // Light-space basis matching the shadow camera's lookAt orientation (used for texel snapping).
  private readonly lightRight = new THREE.Vector3()
  private readonly lightUp = new THREE.Vector3()
  private readonly lightForward = new THREE.Vector3()
  private readonly snapped = new THREE.Vector3()

  constructor(
    private readonly scene: THREE.Scene,
    settings: QualitySettings,
  ) {
    scene.background = new THREE.Color('#2b2842')
    scene.fog = new THREE.FogExp2('#4b3f56', 0.0075)
    this.sun.target = this.sunTarget
    scene.add(this.sun, this.sunTarget, this.hemi)

    this.lightForward.copy(SUN_DIRECTION).negate()
    this.lightRight.crossVectors(this.lightForward, THREE.Object3D.DEFAULT_UP).normalize()
    this.lightUp.crossVectors(this.lightRight, this.lightForward).normalize()

    this.buildTestScene()
    this.applyQuality(settings)
  }

  applyQuality(settings: QualitySettings) {
    const shadow = this.sun.shadow
    this.sun.castShadow = settings.shadows
    if (shadow.mapSize.x !== settings.shadowMapSize) {
      shadow.map?.dispose()
      shadow.map = null
      shadow.mapSize.set(settings.shadowMapSize, settings.shadowMapSize)
    }
    this.shadowRadius = settings.shadowRadius
    const camera = shadow.camera
    camera.left = -this.shadowRadius
    camera.right = this.shadowRadius
    camera.top = this.shadowRadius
    camera.bottom = -this.shadowRadius
    camera.near = 1
    camera.far = SUN_DISTANCE * 2
    camera.updateProjectionMatrix()
    const texel = (2 * this.shadowRadius) / settings.shadowMapSize
    shadow.bias = -0.0004
    shadow.normalBias = texel * 1.2
  }

  /** `focus` is what the shadow frustum should centre on (the player, or the camera while spectating). */
  update(dt: number, time: number, focus: THREE.Vector3) {
    for (const animate of this.animators) animate(dt, time)

    // Snap the frustum centre to whole shadow texels so shadows don't shimmer while moving.
    const texel = (2 * this.shadowRadius) / this.sun.shadow.mapSize.x
    const right = Math.round(focus.dot(this.lightRight) / texel) * texel
    const up = Math.round(focus.dot(this.lightUp) / texel) * texel
    const forward = focus.dot(this.lightForward)
    this.snapped
      .set(0, 0, 0)
      .addScaledVector(this.lightRight, right)
      .addScaledVector(this.lightUp, up)
      .addScaledVector(this.lightForward, forward)
    this.sunTarget.position.copy(this.snapped)
    this.sun.position.copy(this.snapped).addScaledVector(SUN_DIRECTION, SUN_DISTANCE)
    this.sunTarget.updateMatrixWorld()
  }

  /** Ground height at (x, z). Flat until the terrain lands in M1b. */
  heightAt(_x: number, _z: number): number {
    return 0
  }

  dispose() {
    this.sun.dispose()
    this.animators.length = 0
  }

  /** Temporary M1a scene to verify lighting, shadows and bloom; replaced by terrain + structures in M1b. */
  private buildTestScene() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#4a3f3b', roughness: 1 }),
    )
    ground.receiveShadow = true

    const stone = new THREE.MeshStandardMaterial({ color: '#6d5f57', roughness: 0.9, metalness: 0.02 })
    const monolith = new THREE.Mesh(new THREE.BoxGeometry(4, 18, 2.4), stone)
    monolith.position.set(0, 8.6, -12)
    monolith.rotation.set(0.08, 0.3, -0.12)

    const pillarGeometry = new THREE.CylinderGeometry(0.7, 0.95, 1, 8)
    const pillars: THREE.Mesh[] = []
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      const height = 4 + (i % 3) * 1.8
      const pillar = new THREE.Mesh(pillarGeometry, stone)
      pillar.scale.y = height
      pillar.position.set(Math.cos(angle) * 16, height / 2, -12 + Math.sin(angle) * 16)
      pillars.push(pillar)
    }

    const energy = new THREE.MeshStandardMaterial({ color: '#0b1a1f', emissive: '#56e6ff', emissiveIntensity: 3 })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.12, 12, 96), energy)
    ring.position.set(0, 9, -9.4)
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: '#1d4b5c',
      emissive: '#3fd0e8',
      emissiveIntensity: 2,
      roughness: 0.2,
      metalness: 0.1,
    })
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), crystalMaterial)
    crystal.position.set(9, 2.2, 2)
    crystal.scale.set(0.7, 1.6, 0.7)

    for (const mesh of [monolith, ...pillars, crystal]) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    this.scene.add(ground, monolith, ring, crystal, ...pillars)

    this.animators.push((_dt, time) => {
      ring.rotation.z = time * 0.3
      crystal.rotation.y = time * 0.6
      crystalMaterial.emissiveIntensity = 2 + Math.sin(time * 2)
    })
  }
}
