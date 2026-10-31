import * as THREE from 'three'
import { AudioEngine } from '../audio/audio'
import { EchoSystem } from '../echo/echoSystem'
import { ReactiveRegistry } from '../echo/reactive'
import { Finale } from '../gameplay/finale'
import { Fragments } from '../gameplay/fragments'
import type { RegionId } from '../gameplay/ids'
import { Interactables } from '../gameplay/interactables'
import { Secrets } from '../gameplay/secrets'
import { Intro, titleShot } from '../gameplay/intro'
import { Progression } from '../gameplay/progression'
import { Puzzles } from '../gameplay/puzzles'
import { RegionTracker } from '../gameplay/regions'
import { Avatar } from '../player/avatar'
import { CameraRig } from '../player/camera'
import { Player } from '../player/player'
import { Spectator } from '../player/spectator'
import { QUALITY_PRESETS, type QualityLevel, type QualitySettings } from '../render/quality'
import { RenderSystem, disposeObject3D } from '../render/renderer'
import { uiStore } from '../ui/store'
import { FALL_LIMIT, REGION_SPAWNS, SPAWN } from '../world/layout'
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
/** Camera blend rates (per second) for the title shot, Continue, the intro's descent and leaving the intro. */
const TITLE_SHOT_RATE = 60
const CONTINUE_BLEND_RATE = 2.5
const INTRO_GLIDE_RATE = 0.35
const INTRO_EXIT_RATE = 2

/** Owns the loop, the phase state machine and every engine system. The React UI talks to it through public methods. */
export class Game {
  readonly events = new Emitter<GameEvents>()
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  readonly renderSystem: RenderSystem
  readonly input: Input
  readonly world: World
  readonly echo: EchoSystem
  readonly reactives: ReactiveRegistry
  /** Saved progress (lane B); built before the World so builders can read it as a ProgressView. */
  readonly progression: Progression
  /** Procedural audio (lane B); its AudioContext starts on the first user gesture. */
  readonly audio: AudioEngine
  readonly regions: RegionTracker
  /** E-to-use objects near the explorer; publishes `uiStore.interactPrompt`. */
  readonly interactables = new Interactables()
  /** Choir Sequence, Glass Bridge, Dormant Grid; solved state is restored from `progression` when built. */
  readonly puzzles: Puzzles
  /** The ten memory fragments; recovered ones (from `progression`) stay hidden. */
  readonly fragments: Fragments
  readonly secrets: Secrets
  /** Heart Key, Spire barrier and the Listening Stone's finale; restored from `progression` when built. */
  readonly finale: Finale

  private readonly settings: Settings
  private readonly pulseOrigin = new THREE.Vector3()
  private readonly player: Player
  private readonly avatar: Avatar
  private readonly cameraRig: CameraRig
  /** Free-fly debug camera (F4); null while the third-person camera is active. */
  private spectator: Spectator | null = null
  /** Lane B: the opening sequence, alive only during the 'intro' phase. */
  private intro: Intro | null = null
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
    this.progression = new Progression(this.events)
    this.audio = new AudioEngine(this.events, {
      volume: this.settings.volume,
      muted: this.settings.muted,
      region: this.progression.checkpoint,
    })
    this.reactives = new ReactiveRegistry(this.events)
    this.world = new World(this.scene, quality, this.reactives)
    this.player = new Player(this.world.collision, SPAWN)
    this.avatar = new Avatar()
    this.scene.add(this.avatar.root)
    this.cameraRig = new CameraRig(this.camera, this.world.collision, SPAWN.yaw)
    this.avatar.update(0, this.player, 0)
    this.cameraRig.update(0, this.player.position)
    this.echo = new EchoSystem(this.scene, this.events)
    this.regions = new RegionTracker(this.events)
    this.puzzles = new Puzzles(this.scene, this.world, this.events, this.progression, this.interactables)
    this.fragments = new Fragments(
      this.scene,
      this.world.collision,
      this.reactives,
      this.interactables,
      this.events,
      this.progression,
    )
    this.secrets = new Secrets(this.events, this.progression, this.world.giant, this.interactables)
    this.finale = new Finale(
      this.scene,
      this.events,
      this.progression,
      this.world.undervault.key,
      this.world.spire,
      this.interactables,
      this.player.position,
      {
        shot: (position, target, rate) => {
          this.cameraRig.setCinematic(position, target, rate)
          uiStore.setState({ cinematic: true })
        },
        pulse: (origin) => this.echo.broadcast(origin),
      },
    )
    this.events.on('endingStart', () => {
      this.setPhase('ending')
      this.input.exitPointerLock()
    })

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
      volume: this.settings.volume,
      muted: this.settings.muted,
      perf: { ...uiStore.getState().perf, gpu: this.renderSystem.gpu.name },
    })
    // Dev-only console/automation handle, e.g. `__echo.player.position.set(x, y, z)` to teleport.
    if (process.env.NODE_ENV !== 'production') Object.assign(window, { __echo: this })
  }

  get qualitySettings(): QualitySettings {
    return QUALITY_PRESETS[this.settings.quality]
  }

  /** Opens on the title screen over the live world; `intro` goes straight to the intro (new journey). */
  start(options: { intro?: boolean } = {}) {
    const shot = titleShot((x, z) => this.world.heightAt(x, z))
    this.cameraRig.setCinematic(shot.position, shot.target, TITLE_SHOT_RATE)
    uiStore.setState({ canContinue: Progression.hasSave() })
    if (options.intro) this.beginIntro()
    else this.setPhase('title')
    this.renderSystem.renderer.setAnimationLoop(this.frame)
  }

  // --- Public API for the UI -----------------------------------------------------------------

  /** Title → play the saved journey. Call from a click so the browser allows capturing the mouse. */
  continueJourney() {
    if (this.phase !== 'title') return
    this.placeAt(this.progression.checkpoint)
    this.cameraRig.clearCinematic(CONTINUE_BLEND_RATE)
    this.setPhase('playing')
    this.input.requestPointerLock()
  }

  /** Title → intro → play, for a journey without a save. */
  beginJourney() {
    if (this.phase === 'title') this.beginIntro()
  }

  /** Call from a click so the browser allows capturing the mouse (Esc also skips, without capturing). */
  skipIntro() {
    if (this.phase !== 'intro') return
    this.intro?.finish()
    this.input.requestPointerLock()
  }

  /** End screen → free roam where the finale left the explorer. Call from a click (pointer lock needs a gesture). */
  keepExploring() {
    if (this.phase !== 'ending') return
    this.cameraRig.clearCinematic(CONTINUE_BLEND_RATE)
    uiStore.setState({ cinematic: false })
    this.setPhase('playing')
    this.input.requestPointerLock()
  }

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

  /** Raising the volume also un-mutes. */
  setVolume(volume: number) {
    this.settings.volume = THREE.MathUtils.clamp(volume, 0, 1)
    if (this.settings.volume > 0) this.settings.muted = false
    this.applyAudio()
  }

  setMuted(muted: boolean) {
    this.settings.muted = muted
    this.applyAudio()
  }

  toggleMute() {
    this.setMuted(!this.settings.muted)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.renderSystem.renderer.setAnimationLoop(null)
    this.input.dispose()
    this.progression.dispose()
    this.audio.dispose()
    this.avatar.dispose()
    this.echo.dispose()
    this.reactives.dispose()
    this.puzzles.dispose()
    this.secrets.dispose()
    this.interactables.dispose()
    this.world.dispose()
    disposeObject3D(this.scene)
    this.renderSystem.dispose()
    this.events.clear()
    uiStore.setState({ booted: false, phase: 'boot', pointerLocked: false, region: null, cinematic: false })
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

  private beginIntro() {
    this.setPhase('intro')
    this.intro = new Intro({
      glide: () => this.cameraRig.clearCinematic(INTRO_GLIDE_RATE),
      pulse: () => this.emitPulse(),
      finish: () => {
        this.intro = null
        this.cameraRig.clearCinematic(INTRO_EXIT_RATE)
        this.setPhase('playing')
      },
    })
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

  private applyAudio() {
    this.audio.setVolume(this.settings.volume)
    this.audio.setMuted(this.settings.muted)
    saveSettings(this.settings)
    uiStore.setState({ volume: this.settings.volume, muted: this.settings.muted })
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
    // The world keeps moving under the intro (its first pulse must spread) and the ending; only 'playing' takes input.
    const live = playing || this.phase === 'intro' || this.phase === 'ending'
    if (playing) this.progression.update(dt)
    if (this.phase === 'intro') this.intro?.update(dt)
    if (playing && !this.cameraRig.inCinematic && this.input.wasPressed('pulse')) this.emitPulse()
    this.echo.update(live ? dt : 0)
    this.reactives.update(this.echo.clock, live ? dt : 0)
    if (this.spectator) {
      if (playing) this.spectator.update(dt, this.input, (x, z) => this.world.heightAt(x, z))
    } else {
      if (playing && !this.cameraRig.inCinematic) {
        this.cameraRig.applyLook(this.input)
        this.player.update(dt, this.input, this.cameraRig.yaw)
      } else if (live) {
        this.player.update(dt, null, this.cameraRig.yaw)
      }
      if (playing && this.player.position.y < FALL_LIMIT) this.respawn()
      this.avatar.update(this.phase === 'paused' ? 0 : dt, this.player, this.time)
      this.cameraRig.update(dt, this.player.position)
      if (playing) this.regions.update(this.player.position)
    }
    this.puzzles.update(this.echo.clock, live ? dt : 0, this.player.position)
    this.fragments.update(this.echo.clock, live ? dt : 0, this.time)
    this.finale.update(live ? dt : 0, this.time)
    const reach = playing && !this.spectator && !this.cameraRig.inCinematic ? this.player.position : null
    this.interactables.update(reach, reach !== null && this.input.wasPressed('interact'))
    this.secrets.update(reach)
    const focus = this.spectator ? this.camera.position : this.player.position
    this.world.update(dt, this.time, focus, this.camera.position)
    this.audio.update(dt, this.camera)
  }

  /** Fell into the chasm: back to the current region's spawn point, camera facing on. */
  private respawn() {
    const region = this.regions.current ?? 'cradle'
    this.placeAt(region)
    this.events.emit('respawn', { region })
  }

  /** Explorer to the region's spawn point, camera facing on (respawn, and Continue at the saved checkpoint). */
  private placeAt(region: RegionId) {
    const spawn = REGION_SPAWNS[region]
    this.player.teleport(spawn.x, spawn.z, spawn.yaw)
    this.cameraRig.yaw = spawn.yaw
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
    if (input.wasPressed('mute')) this.toggleMute()
    if (input.wasPressed('freecam') && this.phase === 'playing') this.toggleFreeCam()
    if (input.wasPressed('pause') && performance.now() - this.phaseChangedAt > PHASE_TOGGLE_DEBOUNCE_MS) {
      if (this.phase === 'playing') this.pause()
      else if (this.phase === 'paused') this.resume()
      else if (this.phase === 'intro') this.intro?.finish()
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
