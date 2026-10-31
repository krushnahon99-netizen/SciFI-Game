import * as THREE from 'three'
import type { ReactiveRegistry } from '../echo/reactive'
import { Collision } from '../physics/collision'
import type { QualitySettings } from '../render/quality'
import { installEchoFog, sharedUniforms } from '../render/shaderChunks'
import { SUN_DIRECTION } from './layout'
import { createNoiseTexture, createTerrainMaterial } from './materials'
import { createMountains } from './mountains'
import { AmbientParticles } from './particles'
import { Scatter } from './scatter'
import { createSky } from './sky'
import { buildBridge, type GlassBridge } from './structures/bridge'
import type { Animator, StructureContext } from './structures/context'
import { buildCradle } from './structures/cradle'
import { buildHall, type Hall } from './structures/hall'
import { buildUndervault, type Undervault } from './structures/undervault'
import { buildVale } from './structures/vale'
import { buildWorks, type ConduitWorks } from './structures/works'
import { Terrain } from './terrain'

export { SUN_DIRECTION } from './layout'

const SUN_DISTANCE = 300
const FOG_COLOR = '#5b4b66'
const FOG_DENSITY = 0.0034

/** Assembles the environment and owns global lighting (sun + sky fill) and the player-following shadow frustum. */
export class World {
  readonly sun = new THREE.DirectionalLight('#ffbf8a', 5)
  readonly hemi = new THREE.HemisphereLight('#7f8fc0', '#3a2a22', 1.2)
  readonly terrain: Terrain
  readonly collision: Collision
  /** Hall of Echoes handles (altar, glyph pillars, gate) for the Choir Sequence. */
  readonly hall: Hall
  /** Glass Bridge handles (phase planks, span ends) for the Glass Bridge puzzle. */
  readonly bridge: GlassBridge
  /** Conduit Works handles (grid nodes, core, vault door) for the Dormant Grid. */
  readonly works: ConduitWorks
  /** Undervault handles (the Heart Key on its shrine) for the pickup. */
  readonly undervault: Undervault

  private readonly scatter: Scatter
  private readonly particles: AmbientParticles
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
    this.terrain.createMeshes(createTerrainMaterial(), createTerrainMaterial(true))
    this.collision = new Collision((x, z) => this.terrain.heightAt(x, z))
    scene.add(this.terrain.root, createMountains(this.terrain), createSky(fog.color))

    const context: StructureContext = {
      scene,
      collision: this.collision,
      reactives,
      animate: (animator) => this.animators.push(animator),
    }
    buildCradle(context)
    this.hall = buildHall(context)
    buildVale(context)
    this.bridge = buildBridge(context)
    this.works = buildWorks(context)
    this.undervault = buildUndervault(context)
    this.scatter = new Scatter(this.terrain, this.collision)
    this.particles = new AmbientParticles()
    scene.add(this.scatter.root, this.particles.points)
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
    this.scatter.setDensity(settings.scatterDensity)
    this.particles.setBudget(settings.particleBudget)
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
}
