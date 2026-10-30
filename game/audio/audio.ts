import type { Object3D } from 'three'
import type { Emitter, GameEvents, GamePhase } from '../core/events'
import type { ReactiveKind } from '../echo/reactive'
import type { RegionId } from '../gameplay/ids'
import { Ambience, REGION_TONES, type RegionTone } from './ambience'
import { brownNoise, impulseResponse, whiteNoise, type AudioKit, type Vec3 } from './kit'
import * as sfx from './sfx'

export interface AudioOptions {
  /** Master volume 0–1 (squared for a perceptual curve). */
  volume: number
  muted: boolean
  /** Region whose drone plays first (the saved checkpoint). */
  region: RegionId
}

/** Any of these counts as the user gesture browsers require before audio may start. */
const GESTURES = ['pointerdown', 'pointerup', 'click', 'keydown', 'touchend'] as const
/** Level of everything except UI cues while the pause menu is open. */
const PAUSE_DUCK = 0.35
/** Minimum seconds between two reveal sounds of one kind, so a pulse across a crowded area doesn't stack voices. */
const REVEAL_SPACING: Readonly<Record<ReactiveKind, number>> = {
  crystals: 0.07,
  glyphs: 0.25,
  ghosts: 1.2,
  pastState: 1.5,
  phase: 0.15,
  trigger: 0.1,
}

const PHASE_WARN_SPACING = 0.4

interface Graph {
  readonly kit: AudioKit
  readonly master: GainNode
  readonly duck: GainNode
  readonly ambience: Ambience
}

function hasUserActivation(): boolean {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return activation?.hasBeenActive === true
}

/**
 * Procedural Web Audio engine: region drones and wind, plus one-shot cues driven by game events.
 * The AudioContext is created on the first user gesture (autoplay policy) and suspended while the tab is hidden.
 */
export class AudioEngine {
  private graph: Graph | null = null
  private failed = false
  private disposed = false
  private volume: number
  private muted: boolean
  private region: RegionId
  private paused = false
  /** Correct puzzle steps in a row; each one rings a higher note. */
  private streak = 0
  private readonly lastReveal = new Map<ReactiveKind, number>()
  private lastPhaseWarn = -Infinity
  private readonly unsubscribe: Array<() => void>

  constructor(events: Emitter<GameEvents>, options: AudioOptions) {
    this.volume = options.volume
    this.muted = options.muted
    this.region = options.region
    this.unsubscribe = [
      events.on('pulse', () => this.play((kit) => sfx.pulse(kit, this.tone))),
      events.on('reactiveHit', ({ kind, position }) => this.reveal(kind, position)),
      events.on('footstep', ({ surface, run }) => this.play((kit) => sfx.footstep(kit, surface, run))),
      events.on('land', ({ impact }) => this.play((kit) => sfx.land(kit, impact))),
      events.on('puzzleStep', ({ ok, index }) => {
        const step = this.streak
        this.streak = ok ? step + 1 : 0
        this.play((kit) => sfx.puzzleStep(kit, this.tone, ok, step, index))
      }),
      events.on('choirNote', ({ index, position }) => this.play((kit) => sfx.choirNote(kit, this.tone, index, position))),
      events.on('phaseWarn', ({ position }) => this.phaseWarn(position)),
      events.on('finaleStart', () => this.play((kit) => sfx.finale(kit, REGION_TONES.spire))),
      events.on('puzzleSolved', () => {
        this.streak = 0
        this.play((kit) => sfx.solved(kit, this.tone))
      }),
      events.on('fragmentFound', () => this.play((kit) => sfx.discovery(kit, 'fragment', this.tone))),
      events.on('secretFound', () => this.play((kit) => sfx.discovery(kit, 'secret', this.tone))),
      events.on('itemFound', () => this.play((kit) => sfx.discovery(kit, 'item', this.tone))),
      events.on('regionEnter', ({ id }) => this.setRegion(id)),
      events.on('respawn', ({ region }) => this.setRegion(region)),
      events.on('endingStart', () => this.play((kit) => sfx.solved(kit, REGION_TONES.spire, 1.6))),
      events.on('phase', ({ from, to }) => this.onPhase(from, to)),
    ]
    for (const type of GESTURES) window.addEventListener(type, this.unlock, { capture: true, passive: true })
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    // A remounted game (new journey) follows a click, so the page may already be allowed to play audio.
    if (hasUserActivation()) this.unlock()
  }

  /** True once the browser lets the context run (after the first gesture). */
  get running(): boolean {
    return this.graph?.kit.ctx.state === 'running'
  }

  setVolume(volume: number) {
    this.volume = volume
    this.applyMaster()
  }

  setMuted(muted: boolean) {
    this.muted = muted
    this.applyMaster()
  }

  /** Once per frame: the listener follows the camera and the wind gusts. */
  update(dt: number, camera: Object3D) {
    const graph = this.graph
    if (!graph || graph.kit.ctx.state !== 'running') return
    graph.ambience.update(dt)
    const e = camera.matrixWorld.elements
    const listener = graph.kit.ctx.listener
    if (listener.positionX) {
      listener.positionX.value = e[12]
      listener.positionY.value = e[13]
      listener.positionZ.value = e[14]
      listener.forwardX.value = -e[8]
      listener.forwardY.value = -e[9]
      listener.forwardZ.value = -e[10]
      listener.upX.value = e[4]
      listener.upY.value = e[5]
      listener.upZ.value = e[6]
    } else {
      // Firefox only has the older setter API.
      listener.setPosition(e[12], e[13], e[14])
      listener.setOrientation(-e[8], -e[9], -e[10], e[4], e[5], e[6])
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const off of this.unsubscribe) off()
    for (const type of GESTURES) window.removeEventListener(type, this.unlock, { capture: true })
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    this.graph?.kit.ctx.close().catch(() => undefined)
    this.graph = null
  }

  // --- Internals -------------------------------------------------------------------------------

  private get tone(): RegionTone {
    return REGION_TONES[this.region]
  }

  /** Runs a cue only while the context is running; scheduling into a suspended context would replay it late. */
  private play(cue: (kit: AudioKit) => void) {
    const graph = this.graph
    if (graph && graph.kit.ctx.state === 'running') cue(graph.kit)
  }

  private reveal(kind: ReactiveKind, position: Vec3) {
    const graph = this.graph
    if (!graph || graph.kit.ctx.state !== 'running') return
    const now = graph.kit.ctx.currentTime
    if (now - (this.lastReveal.get(kind) ?? -Infinity) < REVEAL_SPACING[kind]) return
    this.lastReveal.set(kind, now)
    sfx.reveal(graph.kit, kind, position, this.tone)
  }

  /** A whole bridge of planks warns at once; one warning per PHASE_WARN_SPACING is enough. */
  private phaseWarn(position: Vec3) {
    const graph = this.graph
    if (!graph || graph.kit.ctx.state !== 'running') return
    const now = graph.kit.ctx.currentTime
    if (now - this.lastPhaseWarn < PHASE_WARN_SPACING) return
    this.lastPhaseWarn = now
    sfx.phaseWarn(graph.kit, this.tone, position)
  }

  private setRegion(id: RegionId) {
    if (id === this.region) return
    this.region = id
    this.graph?.ambience.setTone(this.tone)
  }

  private onPhase(from: GamePhase, to: GamePhase) {
    this.paused = to === 'paused'
    const graph = this.graph
    if (graph) graph.duck.gain.setTargetAtTime(this.paused ? PAUSE_DUCK : 1, graph.kit.ctx.currentTime, 0.12)
    if (to === 'paused') this.play((kit) => sfx.uiCue(kit, 'open'))
    else if (from === 'paused' || from === 'title') this.play((kit) => sfx.uiCue(kit, 'close'))
  }

  private applyMaster() {
    const graph = this.graph
    if (!graph) return
    graph.master.gain.setTargetAtTime(this.muted ? 0 : this.volume ** 2, graph.kit.ctx.currentTime, 0.03)
  }

  private readonly unlock = () => {
    if (this.disposed || this.failed || document.hidden) return
    this.graph ??= this.build()
    const ctx = this.graph?.kit.ctx
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => undefined)
  }

  private readonly onVisibilityChange = () => {
    const ctx = this.graph?.kit.ctx
    if (!ctx || ctx.state === 'closed') return
    if (document.hidden) ctx.suspend().catch(() => undefined)
    else ctx.resume().catch(() => undefined)
  }

  /**
   * buses (ambience, sfx, reverb and echo returns) → pause duck → master (volume) → compressor → speakers.
   * UI cues skip the duck so menu sounds stay clear while paused.
   */
  private build(): Graph | null {
    let ctx: AudioContext
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' })
    } catch {
      this.failed = true
      return null
    }
    const master = new GainNode(ctx, { gain: 0 })
    const compressor = new DynamicsCompressorNode(ctx, { threshold: -16, knee: 12, ratio: 3.5, attack: 0.005, release: 0.3 })
    master.connect(compressor).connect(ctx.destination)
    const duck = new GainNode(ctx, { gain: this.paused ? PAUSE_DUCK : 1 })
    duck.connect(master)
    const bus = (gain: number, destination: AudioNode) => {
      const node = new GainNode(ctx, { gain })
      node.connect(destination)
      return node
    }

    const convolver = new ConvolverNode(ctx, { buffer: impulseResponse(ctx, 2.4, 3) })
    convolver.connect(bus(0.75, duck))
    const reverb = bus(1, convolver)

    // The "echo": a damped feedback delay for the pulse and the big moments.
    const echo = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 220 })
    const delay = new DelayNode(ctx, { delayTime: 0.43, maxDelayTime: 1 })
    const damping = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2400 })
    const feedback = new GainNode(ctx, { gain: 0.42 })
    echo.connect(delay).connect(damping).connect(feedback).connect(delay)
    damping.connect(bus(0.55, duck))
    damping.connect(bus(0.3, reverb))

    const white = whiteNoise(ctx, 2)
    const kit: AudioKit = {
      ctx,
      noise: white,
      buses: { sfx: bus(0.9, duck), ui: bus(0.6, master), ambience: bus(0.55, duck), reverb, echo },
      voices: 0,
    }
    const ambience = new Ambience(ctx, kit.buses.ambience, { white, brown: brownNoise(ctx, 4) }, this.tone)
    // Fades the whole mix in from silence the first time the context runs.
    master.gain.setTargetAtTime(this.muted ? 0 : this.volume ** 2, ctx.currentTime, 0.5)
    return { kit, master, duck, ambience }
  }
}
