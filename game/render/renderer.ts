import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { QualitySettings } from './quality'

export interface GpuInfo {
  name: string
  software: boolean
}

export interface BloomParams {
  strength: number
  radius: number
  /** Linear HDR luminance above which pixels bloom; keep near 1 so only emissives glow. */
  threshold: number
}

const DEFAULT_BLOOM: BloomParams = { strength: 0.55, radius: 0.45, threshold: 0.9 }

function readGpuInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): GpuInfo {
  let name = 'Unknown GPU'
  try {
    name = String(gl.getParameter(gl.RENDERER))
    // Chrome/Safari mask RENDERER; the debug extension (deprecated in Firefox, which needs no fallback) unmasks it.
    if (/^webkit webgl$/i.test(name)) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) name = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
    }
  } catch {
    // Some privacy modes throw here; keep the placeholder name.
  }
  return { name, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name) }
}

/**
 * Owns the WebGL renderer and post-processing. Bloom runs through EffectComposer
 * (RenderPass → UnrealBloomPass → OutputPass for tone mapping + sRGB); without bloom we render directly.
 */
export class RenderSystem {
  readonly renderer: THREE.WebGLRenderer
  readonly canvas: HTMLCanvasElement
  readonly gpu: GpuInfo
  onResize: ((width: number, height: number) => void) | null = null
  onContextLost: (() => void) | null = null

  private settings: QualitySettings
  private renderScale: number
  private composer: EffectComposer | null = null
  private renderPass: RenderPass | null = null
  private bloomPass: UnrealBloomPass | null = null
  private composerSamples = 0
  private readonly bloom: BloomParams = { ...DEFAULT_BLOOM }
  private readonly floatTargets: boolean
  private readonly maxSamples: number
  private readonly resizeObserver: ResizeObserver

  constructor(
    private readonly container: HTMLElement,
    settings: QualitySettings,
    renderScale: number,
  ) {
    this.settings = settings
    this.renderScale = renderScale
    // MSAA lives on the composer target, so the default framebuffer needs none.
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false })
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // Reset manually each frame so stats include every post-processing pass.
    this.renderer.info.autoReset = false

    const gl = this.renderer.getContext()
    this.gpu = readGpuInfo(gl)
    this.floatTargets =
      this.renderer.extensions.has('EXT_color_buffer_float') || this.renderer.extensions.has('EXT_color_buffer_half_float')
    this.maxSamples = 'MAX_SAMPLES' in gl ? Number(gl.getParameter(gl.MAX_SAMPLES)) || 0 : 0

    this.canvas = this.renderer.domElement
    Object.assign(this.canvas.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', outline: 'none' })
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost)
    container.appendChild(this.canvas)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.applyQuality(settings, renderScale)
  }

  get pixelRatio(): number {
    return this.renderer.getPixelRatio()
  }

  /** Returns whether the shadow toggle changed (materials must then recompile). */
  applyQuality(settings: QualitySettings, renderScale: number): { shadowsChanged: boolean } {
    const shadowsChanged = this.renderer.shadowMap.enabled !== settings.shadows
    this.settings = settings
    this.renderScale = renderScale
    this.renderer.shadowMap.enabled = settings.shadows

    const wantComposer = settings.bloom && this.floatTargets
    const samples = Math.min(settings.msaaSamples, this.maxSamples)
    if (this.composer && (!wantComposer || samples !== this.composerSamples)) this.disposeComposer()
    if (wantComposer && !this.composer) this.createComposer(samples)

    this.resize()
    return { shadowsChanged }
  }

  setBloom(params: Partial<BloomParams>) {
    Object.assign(this.bloom, params)
    if (!this.bloomPass) return
    this.bloomPass.strength = this.bloom.strength
    this.bloomPass.radius = this.bloom.radius
    this.bloomPass.threshold = this.bloom.threshold
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth)
    const height = Math.max(1, this.container.clientHeight)
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.settings.maxPixelRatio) * this.renderScale
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)
    if (this.composer) {
      this.composer.setPixelRatio(pixelRatio)
      this.composer.setSize(width, height)
    }
    this.onResize?.(width, height)
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.info.reset()
    if (this.composer && this.renderPass) {
      this.renderPass.scene = scene
      this.renderPass.camera = camera
      this.composer.render()
    } else {
      this.renderer.render(scene, camera)
    }
  }

  dispose() {
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.disposeComposer()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }

  private createComposer(samples: number) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples })
    target.texture.name = 'echo.composer'
    const composer = new EffectComposer(this.renderer, target)
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera())
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), this.bloom.strength, this.bloom.radius, this.bloom.threshold)
    composer.addPass(this.renderPass)
    composer.addPass(this.bloomPass)
    composer.addPass(new OutputPass())
    this.composer = composer
    this.composerSamples = samples
  }

  private disposeComposer() {
    if (!this.composer) return
    for (const pass of this.composer.passes) pass.dispose()
    this.composer.dispose()
    this.composer = null
    this.renderPass = null
    this.bloomPass = null
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault()
    this.onContextLost?.()
  }
}

/** Disposes every geometry, material and texture below `root` (shared resources are disposed once). */
export function disposeObject3D(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  root.traverse((object) => {
    const mesh = object as Partial<THREE.Mesh>
    if (mesh.geometry) geometries.add(mesh.geometry)
    const material = mesh.material
    if (material) for (const entry of Array.isArray(material) ? material : [material]) materials.add(entry)
  })
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => {
    const values: unknown[] = Object.values(material)
    const uniforms = (material as Partial<THREE.ShaderMaterial>).uniforms
    if (uniforms) for (const uniform of Object.values(uniforms)) values.push(uniform.value)
    for (const value of values) if (value instanceof THREE.Texture) value.dispose()
    material.dispose()
  })
}
