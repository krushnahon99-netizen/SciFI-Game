import * as THREE from 'three'
import { EchoSystem } from '../echo/echoSystem'
import { Avatar } from '../player/avatar'
import { CameraRig } from '../player/camera'
import { Player } from '../player/player'
import { Spectator } from '../player/spectator'
import { QUALITY_PRESETS, type QualityLevel, type QualitySettings } from '../render/quality'
import { RenderSystem, disposeObject3D } from '../render/renderer'
import { uiStore } from '../ui/store'
import { SPAWN } from '../world/layout'
import { World } from '../world/world'
import { Emitter, type GameEvents, type GamePhase } from './events'
import { Input } from './input'
import { loadSettings, saveSettings, type Settings } from './settings'

const MAX_FRAME_DT = 0.1
const PERF_SAMPLE_SECONDS = 0.5
/** Esc can both exit pointer lock (→ pause) and arrive as a key press; ignore toggles right after a phase change. */
const PHASE_TOGGLE_DEBOUNCE_MS = 300
/** Height of the backpack core (the pulse emitter) above the player's feet. */
const PULSE_EMITTER_HEIGHT = 1.3

/** Owns the loop, the phase state machine and every engine system. The React UI talks to it through public methods. */
export class Game {
  readonly events = new Emitter<GameEvents>()
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  readonly renderSystem: RenderSystem
  readonly input: Input
  readonly world: World
  readonly echo: EchoSystem

  private readonly settings: Settings
  private readonly pulseOrigin = new THREE.Vector3()
  private readonly player: Player
  private readonly avatar: Avatar
  private readonly cameraRig: CameraRig
  /** Free-fly debug camera (F4); null while the third-person camera is active. */
  private spectator: Spectator | null = null
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
    this.player = new Player(this.world.collision, SPAWN)
    this.avatar = new Avatar()
    this.scene.add(this.avatar.root)
    this.cameraRig = new CameraRig(this.camera, this.world.collision, SPAWN.yaw)
    this.avatar.update(0, this.player, 0)
    this.cameraRig.update(0, this.player.position)
    this.echo = new EchoSystem(this.scene, this.events)

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
    this.avatar.dispose()
    this.echo.dispose()
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
    const playing = this.phase === 'playing'
    if (playing && !this.cameraRig.inCinematic && this.input.wasPressed('pulse')) this.emitPulse()
    this.echo.update(playing ? dt : 0)
    if (this.spectator) {
      if (playing) this.spectator.update(dt, this.input, (x, z) => this.world.heightAt(x, z))
    } else {
      if (playing && !this.cameraRig.inCinematic) {
        this.cameraRig.applyLook(this.input)
        this.player.update(dt, this.input, this.cameraRig.yaw)
      } else if (playing) {
        this.player.update(dt, null, this.cameraRig.yaw)
      }
      this.avatar.update(playing ? dt : 0, this.player, this.time)
      this.cameraRig.update(dt, this.player.position)
    }
    const focus = this.spectator ? this.camera.position : this.player.position
    this.world.update(dt, this.time, focus, this.camera.position)
  }

  /** Q / click: pulse from the explorer's backpack core (from the camera while free-flying). */
  private emitPulse() {
    const origin = this.pulseOrigin
    if (this.spectator) {
      origin.copy(this.camera.position)
    } else {
      origin.copy(this.player.position)
      origin.y += PULSE_EMITTER_HEIGHT
    }
    if (this.echo.trigger(origin)) this.avatar.flare()
  }

  /** F4: detach a free-fly debug camera from the player (and back). */
  private toggleFreeCam() {
    if (this.spectator) {
      this.spectator = null
      return
    }
    this.spectator = new Spectator(this.camera, this.camera.position.clone(), this.cameraRig.yaw, this.cameraRig.pitch)
  }

  private handleSystemActions() {
    const input = this.input
    if (input.wasPressed('perf')) this.togglePerf()
    if (input.wasPressed('freecam') && this.phase === 'playing') this.toggleFreeCam()
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
