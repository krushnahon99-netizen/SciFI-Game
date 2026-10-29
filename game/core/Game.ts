import * as THREE from 'three'
import { Spectator } from '../player/spectator'
import { QUALITY_PRESETS, type QualityLevel, type QualitySettings } from '../render/quality'
import { RenderSystem, disposeObject3D } from '../render/renderer'
import { uiStore } from '../ui/store'
import { World } from '../world/world'
import { Emitter, type GameEvents, type GamePhase } from './events'
import { Input } from './input'
import { loadSettings, saveSettings, type Settings } from './settings'

const MAX_FRAME_DT = 0.1
const PERF_SAMPLE_SECONDS = 0.5
/** Esc can both exit pointer lock (→ pause) and arrive as a key press; ignore toggles right after a phase change. */
const PHASE_TOGGLE_DEBOUNCE_MS = 300

/** Owns the loop, the phase state machine and every engine system. The React UI talks to it through public methods. */
export class Game {
  readonly events = new Emitter<GameEvents>()
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  readonly renderSystem: RenderSystem
  readonly input: Input
  readonly world: World

  private readonly settings: Settings
  private readonly spectator: Spectator
  private phase: GamePhase = 'boot'
  private phaseChangedAt = 0
  /** Wall-clock seconds for ambient animation (keeps running while paused). */
  private time = 0
  private lastFrameTime = -1
  private readonly perfSample = { frames: 0, seconds: 0, cpuMs: 0 }
  private disposed = false

  constructor(container: HTMLElement) {
    this.settings = loadSettings()
    this.renderSystem = new RenderSystem(container, QUALITY_PRESETS[this.settings.quality], this.settings.renderScale)
    if (this.renderSystem.gpu.software && !this.settings.qualityExplicit && this.settings.quality !== 'low') {
      this.settings.quality = 'low'
      this.renderSystem.applyQuality(QUALITY_PRESETS.low, this.settings.renderScale)
    }

    const quality = this.qualitySettings
    this.camera.far = quality.viewDistance
    this.renderSystem.onResize = (width, height) => {
      this.camera.aspect = width / height
      this.camera.updateProjectionMatrix()
    }
    this.renderSystem.onContextLost = () => {
      uiStore.setState({ fatalError: 'The graphics context was lost. Reload the page to continue.' })
    }
    this.renderSystem.resize()

    this.input = new Input(this.renderSystem.canvas, this.events)
    this.world = new World(this.scene, quality)
    this.spectator = new Spectator(this.camera, new THREE.Vector3(0, 6, 30))

    this.events.on('pointerLock', ({ locked }) => {
      uiStore.setState({ pointerLocked: locked })
      if (!locked && this.phase === 'playing') this.pause()
    })
    this.events.on('lookMode', ({ mode }) => uiStore.setState({ lookMode: mode }))

    uiStore.setState({
      booted: true,
      fatalError: null,
      pointerLocked: false,
      lookMode: this.input.lookMode,
      quality: quality.level,
      renderScale: this.settings.renderScale,
      perf: { ...uiStore.getState().perf, gpu: this.renderSystem.gpu.name },
    })
  }

  get qualitySettings(): QualitySettings {
    return QUALITY_PRESETS[this.settings.quality]
  }

  start() {
    this.setPhase('playing')
    this.renderSystem.renderer.setAnimationLoop(this.frame)
  }

  // --- Public API for the UI -----------------------------------------------------------------

  pause() {
    if (this.phase !== 'playing') return
    this.setPhase('paused')
    this.input.exitPointerLock()
  }

  /** Call from a click handler so the browser allows re-capturing the mouse. */
  resume() {
    if (this.phase !== 'paused') return
    this.setPhase('playing')
    this.input.requestPointerLock()
  }

  togglePerf() {
    uiStore.setState((state) => ({ showPerf: !state.showPerf }))
  }

  setQuality(level: QualityLevel) {
    this.settings.quality = level
    this.settings.qualityExplicit = true
    this.applyQuality()
  }

  setRenderScale(scale: number) {
    this.settings.renderScale = THREE.MathUtils.clamp(scale, 0.5, 1)
    this.applyQuality()
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.renderSystem.renderer.setAnimationLoop(null)
    this.input.dispose()
    this.world.dispose()
    disposeObject3D(this.scene)
    this.renderSystem.dispose()
    this.events.clear()
    uiStore.setState({ booted: false, phase: 'boot', pointerLocked: false })
  }

  // --- Internals -------------------------------------------------------------------------------

  private setPhase(next: GamePhase) {
    const from = this.phase
    if (from === next) return
    this.phase = next
    this.phaseChangedAt = performance.now()
    this.input.lockOnClick = next === 'playing'
    uiStore.setState({ phase: next })
    this.events.emit('phase', { from, to: next })
  }

  private applyQuality() {
    const quality = this.qualitySettings
    const { shadowsChanged } = this.renderSystem.applyQuality(quality, this.settings.renderScale)
    this.world.applyQuality(quality)
    if (shadowsChanged) {
      this.scene.traverse((object) => {
        const material = (object as Partial<THREE.Mesh>).material
        if (!material) return
        for (const entry of Array.isArray(material) ? material : [material]) entry.needsUpdate = true
      })
    }
    this.camera.far = quality.viewDistance
    this.camera.updateProjectionMatrix()
    saveSettings(this.settings)
    uiStore.setState({ quality: quality.level, renderScale: this.settings.renderScale })
    this.events.emit('quality', { level: quality.level })
  }

  private readonly frame = (now: number) => {
    if (this.disposed) return
    const dt = this.lastFrameTime < 0 ? 1 / 60 : Math.min((now - this.lastFrameTime) / 1000, MAX_FRAME_DT)
    this.lastFrameTime = now
    const cpuStart = performance.now()

    this.update(dt)
    this.renderSystem.render(this.scene, this.camera)
    this.input.endFrame()

    this.samplePerf(dt, performance.now() - cpuStart)
  }

  private update(dt: number) {
    this.time += dt
    this.handleSystemActions()
    if (this.phase === 'playing') {
      this.spectator.update(dt, this.input, (x, z) => this.world.heightAt(x, z))
    }
    this.world.update(dt, this.time, this.camera.position)
  }

  private handleSystemActions() {
    const input = this.input
    if (input.wasPressed('perf')) this.togglePerf()
    if (input.wasPressed('pause') && performance.now() - this.phaseChangedAt > PHASE_TOGGLE_DEBOUNCE_MS) {
      if (this.phase === 'playing') this.pause()
      else if (this.phase === 'paused') this.resume()
    }
  }

  private samplePerf(dt: number, cpuMs: number) {
    const sample = this.perfSample
    sample.frames++
    sample.seconds += dt
    sample.cpuMs += cpuMs
    if (sample.seconds < PERF_SAMPLE_SECONDS) return
    const info = this.renderSystem.renderer.info
    uiStore.setState({
      perf: {
        fps: Math.round(sample.frames / sample.seconds),
        frameMs: (sample.seconds / sample.frames) * 1000,
        cpuMs: sample.cpuMs / sample.frames,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        pixelRatio: this.renderSystem.pixelRatio,
        gpu: this.renderSystem.gpu.name,
      },
    })
    sample.frames = 0
    sample.seconds = 0
    sample.cpuMs = 0
  }
}
