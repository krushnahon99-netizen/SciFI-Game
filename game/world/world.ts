import * as THREE from 'three'
import type { ReactiveRegistry } from '../echo/reactive'
import { Collision } from '../physics/collision'
import type { QualitySettings } from '../render/quality'
import { installEchoFog, sharedUniforms } from '../render/shaderChunks'
import { MONOLITH, SUN_DIRECTION } from './layout'
import { createEnergyMaterial, createNoiseTexture, createStoneMaterial, createTerrainMaterial } from './materials'
import { createMountains } from './mountains'
import { createSky } from './sky'
import { buildCradleEchoes } from './structures/cradle'
import { Terrain } from './terrain'

export { SUN_DIRECTION } from './layout'

const SUN_DISTANCE = 300
const FOG_COLOR = '#5b4b66'
const FOG_DENSITY = 0.0034

type Animator = (dt: number, time: number) => void

/** Assembles the environment and owns global lighting (sun + sky fill) and the player-following shadow frustum. */
export class World {
  readonly sun = new THREE.DirectionalLight('#ffbf8a', 5)
  readonly hemi = new THREE.HemisphereLight('#7f8fc0', '#3a2a22', 1.2)
  readonly terrain: Terrain
  readonly collision: Collision

  private readonly noiseTexture: THREE.DataTexture
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
    reactives: ReactiveRegistry,
  ) {
    installEchoFog()
    const fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY)
    scene.fog = fog
    scene.background = new THREE.Color(FOG_COLOR)
    this.sun.target = this.sunTarget
    scene.add(this.sun, this.sunTarget, this.hemi)

    this.lightForward.copy(SUN_DIRECTION).negate()
    this.lightRight.crossVectors(this.lightForward, THREE.Object3D.DEFAULT_UP).normalize()
    this.lightUp.crossVectors(this.lightRight, this.lightForward).normalize()

    this.noiseTexture = createNoiseTexture(settings.anisotropy)
    sharedUniforms.uEchoNoise.value = this.noiseTexture
    this.terrain = new Terrain()
    sharedUniforms.uTerrainShadow.value = this.terrain.shadowTexture
    sharedUniforms.uTerrainSplat.value = this.terrain.splatTexture
    this.terrain.createMeshes(createTerrainMaterial())
    this.collision = new Collision((x, z) => this.terrain.heightAt(x, z))
    scene.add(this.terrain.root, createMountains(this.terrain), createSky(fog.color))

    this.buildPlaceholderMonolith()
    buildCradleEchoes({ scene, collision: this.collision, reactives })
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

    this.terrain.setDetail(settings.terrainDetail)
    if (this.noiseTexture.anisotropy !== settings.anisotropy) {
      this.noiseTexture.anisotropy = settings.anisotropy
      this.noiseTexture.needsUpdate = true
    }
  }

  /**
   * `focus` is what the shadow frustum centres on (the player, or the camera while spectating);
   * `viewer` drives terrain LOD.
   */
  update(dt: number, time: number, focus: THREE.Vector3, viewer: THREE.Vector3 = focus) {
    sharedUniforms.uEchoTime.value = time
    for (const animate of this.animators) animate(dt, time)
    this.terrain.update(viewer)

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

  /** Ground height at (x, z) from the baked heightmap (matches the full-detail mesh). */
  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z)
  }

  dispose() {
    this.sun.dispose()
    this.animators.length = 0
    this.terrain.dispose()
    // disposeObject3D doesn't reach textures held only in sharedUniforms.
    this.noiseTexture.dispose()
    sharedUniforms.uEchoNoise.value = null
    sharedUniforms.uTerrainShadow.value = null
    sharedUniforms.uTerrainSplat.value = null
  }

  /** Placeholder Sundered Monolith (two leaning halves + energy ring) until the M3a structures land. */
  private buildPlaceholderMonolith() {
    const ground = this.terrain.heightAt(MONOLITH.x, MONOLITH.z)
    const stone = createStoneMaterial('#8b7d72')
    const slab = new THREE.BoxGeometry(5, 24, 2.8)
    const left = new THREE.Mesh(slab, stone)
    left.position.set(MONOLITH.x - 2.6, ground + 10.5, MONOLITH.z)
    left.rotation.set(0.05, 0.4, 0.16)
    const right = new THREE.Mesh(slab, stone)
    right.scale.set(0.9, 0.7, 0.9)
    right.position.set(MONOLITH.x + 3.4, ground + 7, MONOLITH.z + 1.5)
    right.rotation.set(-0.08, 0.25, -0.28)
    for (const mesh of [left, right]) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.14, 12, 96), createEnergyMaterial('#56e6ff', 4))
    ring.position.set(MONOLITH.x + 0.4, ground + 14, MONOLITH.z + 0.8)
    ring.rotation.y = 0.35
    this.scene.add(left, right, ring)
    this.collision.addBox(left.position.x, left.position.z, 2.6, 1.5, left.rotation.y, ground - 2, ground + 21)
    this.collision.addBox(right.position.x, right.position.z, 2.4, 1.35, right.rotation.y, ground - 2, ground + 15)
    this.animators.push((_dt, time) => {
      ring.rotation.z = time * 0.25
    })
  }
}
