import * as THREE from 'three'
import type { Emitter, GameEvents } from '../core/events'
import { GhostScene } from '../echo/ghosts'
import { PULSE_SPEED } from '../echo/pulseShader'
import { BRIDGE, WORKS } from '../world/layout'
import type { GlassBridge } from '../world/structures/bridge'
import type { Hall } from '../world/structures/hall'
import type { ConduitWorks } from '../world/structures/works'
import type { World } from '../world/world'
import { PROMPTS } from './content'
import type { ProgressView } from './ids'
import type { Interactables } from './interactables'

type Vec3 = { readonly x: number; readonly y: number; readonly z: number }

interface PuzzleContext {
  scene: THREE.Scene
  events: Emitter<GameEvents>
  progress: ProgressView
  interactables: Interactables
}

// --- Choir Sequence (Hall of Echoes) -------------------------------------------------------------

/** The order the ghost choir sings the pillars in (indices into `Hall.pillars`, clockwise from the north-west). */
export const CHOIR_ORDER: readonly number[] = [2, 0, 3, 1]

const CHOIR = {
  /** A pulse whose origin lies within this distance of the altar (ground plane) starts the replay. */
  range: 9,
  /** Seconds between the wavefront reaching the altar and the first voice. */
  leadIn: 0.8,
  /** Seconds between voices. */
  gap: 1.8,
  /** Singers stand this far from the altar centre, just inside their pillar, facing it. */
  singerRadius: 4.1,
  /** Attune reach, measured from the pillar's centre. */
  reach: 2.6,
  /** Glyph height above the pillar base: where the sung note sounds. */
  glyphHeight: 2.7,
}
const SINGER_TIMING = { fadeIn: 0.5, hold: 3.4, fadeOut: 1.3 }
/** Pillar glyph emissive intensities; a wrong note silences every pillar for `silenceSeconds`. */
const GLYPH = { dormant: 0.25, attuned: 1.9, solved: 2.8, flare: 4, flareSeconds: 1.6, silenced: 0.03, silenceSeconds: 1.4 }

/**
 * Pulse beside the altar → one ghost singer after another appears at a pillar and sings it (its glyph flares,
 * `choirNote` plays its note). Attune the pillars (E) in that order; a wrong one silences them all and resets.
 * The fourth correct pillar opens the north gate.
 */
class ChoirSequence {
  private readonly singers: GhostScene[]
  private readonly flareAt: number[]
  private readonly attuned = new Set<number>()
  private solved: boolean
  private clock = 0
  private replayStart = -Infinity
  private replayEnd = -Infinity
  private nextVoice = CHOIR_ORDER.length
  private silencedAt = -Infinity
  private readonly pulse = { origin: new THREE.Vector3(), time: 0 }
  private readonly unsubscribe: () => void

  constructor(
    private readonly hall: Hall,
    private readonly context: PuzzleContext,
  ) {
    const { altar, pillars } = hall
    this.solved = context.progress.isSolved('choir')
    if (this.solved) hall.gate.open(true)
    this.flareAt = pillars.map(() => -Infinity)
    this.singers = pillars.map((pillar, index) => {
      const angle = Math.atan2(pillar.position.z - altar.z, pillar.position.x - altar.x)
      const x = altar.x + Math.cos(angle) * CHOIR.singerRadius
      const z = altar.z + Math.sin(angle) * CHOIR.singerRadius
      const floor = pillar.position.y
      return new GhostScene(
        context.scene,
        [{ path: [[x, z]], pose: 'sing', lookAt: [pillar.position.x, pillar.position.z], scale: 1.05 }],
        () => floor,
        `choir.singer${index}`,
        SINGER_TIMING,
      )
    })
    pillars.forEach((pillar, index) =>
      context.interactables.add({
        position: pillar.position,
        reach: CHOIR.reach,
        prompt: () => (this.solved || this.attuned.has(index) ? null : PROMPTS.attunePillar),
        interact: () => this.attune(index),
      }),
    )
    this.unsubscribe = context.events.on('pulse', ({ origin, time }) => this.onPulse(origin, time))
    this.applyGlyphs()
  }

  update(clock: number, dt: number) {
    this.clock = clock
    while (this.nextVoice < CHOIR_ORDER.length && clock >= this.replayStart + this.nextVoice * CHOIR.gap) {
      const index = CHOIR_ORDER[this.nextVoice++]
      this.flareAt[index] = clock
      const { x, y, z } = this.hall.pillars[index].position
      this.context.events.emit('choirNote', { index, position: { x, y: y + CHOIR.glyphHeight, z } })
    }
    if (clock <= this.replayEnd + 1) for (const singer of this.singers) singer.update(clock, dt)
    this.applyGlyphs()
  }

  dispose() {
    this.unsubscribe()
  }

  private onPulse(origin: Vec3, time: number) {
    const { altar } = this.hall
    if (time < this.replayEnd || Math.hypot(origin.x - altar.x, origin.z - altar.z) > CHOIR.range) return
    const arrival = time + Math.hypot(origin.x - altar.x, origin.y - altar.y, origin.z - altar.z) / PULSE_SPEED
    this.replayStart = arrival + CHOIR.leadIn
    this.replayEnd =
      this.replayStart + (CHOIR_ORDER.length - 1) * CHOIR.gap + SINGER_TIMING.hold + SINGER_TIMING.fadeOut
    this.nextVoice = 0
    this.pulse.origin.set(origin.x, origin.y, origin.z)
    this.pulse.time = time
    CHOIR_ORDER.forEach((pillar, voice) => this.singers[pillar].hit(this.pulse, this.replayStart + voice * CHOIR.gap))
  }

  private attune(index: number) {
    if (this.solved || this.attuned.has(index)) return
    const { events } = this.context
    if (CHOIR_ORDER[this.attuned.size] !== index) {
      this.attuned.clear()
      this.silencedAt = this.clock
      events.emit('puzzleStep', { id: 'choir', ok: false, index })
      return
    }
    this.attuned.add(index)
    this.flareAt[index] = this.clock
    events.emit('puzzleStep', { id: 'choir', ok: true, index })
    if (this.attuned.size < CHOIR_ORDER.length) return
    this.solved = true
    this.flareAt.fill(this.clock)
    this.hall.gate.open()
    events.emit('puzzleSolved', { id: 'choir' })
  }

  private applyGlyphs() {
    const clock = this.clock
    const silenced = clock - this.silencedAt < GLYPH.silenceSeconds
    this.hall.pillars.forEach((pillar, index) => {
      const base = this.solved
        ? GLYPH.solved
        : this.attuned.has(index)
          ? GLYPH.attuned
          : silenced
            ? GLYPH.silenced
            : GLYPH.dormant
      const since = clock - this.flareAt[index]
      const flare = since >= 0 && since < GLYPH.flareSeconds ? (1 - since / GLYPH.flareSeconds) ** 2 : 0
      pillar.glyph.emissiveIntensity = base + flare * GLYPH.flare
    })
  }
}

// --- Glass Bridge (chasm) ------------------------------------------------------------------------

const SPAN = {
  /** Distance from the span's centre line (`BRIDGE.z`) that still counts as on the span. */
  halfWidth: 2,
  /** On the span means above this height (the deck is ~4.4–5.2 m; falling drops below it at once). */
  minY: BRIDGE.padHeight - 1.5,
}

/** Walking the phase planks from one pier to the other while they are solid locks the bridge in the present. */
class GlassBridgePuzzle {
  private solved: boolean
  /** End the explorer stepped onto the span from: −1 west, 1 east, 0 = not on the span. */
  private from = 0
  private readonly unsubscribe: () => void

  constructor(
    private readonly bridge: GlassBridge,
    private readonly context: PuzzleContext,
  ) {
    this.solved = context.progress.isSolved('glass-bridge')
    if (this.solved) bridge.stabilize()
    // Falling into the chasm before the bridge holds is a failed attempt (it unlocks the journal hints).
    this.unsubscribe = context.events.on('respawn', ({ region }) => {
      if (region === 'chasm' && !this.solved) context.events.emit('puzzleStep', { id: 'glass-bridge', ok: false })
    })
  }

  update(player: THREE.Vector3) {
    if (this.solved) return
    const { west, east } = this.bridge
    const onSpan =
      player.x > west && player.x < east && Math.abs(player.z - BRIDGE.z) < SPAN.halfWidth && player.y > SPAN.minY
    if (onSpan) {
      if (this.from === 0) this.from = player.x < (west + east) / 2 ? -1 : 1
      return
    }
    const crossed = (this.from < 0 && player.x >= east) || (this.from > 0 && player.x <= west)
    this.from = 0
    if (!crossed) return
    this.solved = true
    this.bridge.stabilize()
    this.context.events.emit('puzzleSolved', { id: 'glass-bridge' })
  }

  dispose() {
    this.unsubscribe()
  }
}

// --- Dormant Grid (Conduit Works) ----------------------------------------------------------------

const GRID = {
  /** A pulse charges the nodes whose plinth top lies within this distance of its origin (nodes are 26–46 m apart). */
  range: 11,
  /** Seconds a node stays fully charged, then seconds it takes to fade out. */
  hold: 5,
  fade: 13,
  /** Below this charge a node flickers: it is about to go dark. */
  flickerBelow: 0.35,
  /** Seconds for the core and conduits to wake once the circuit closes. */
  powerUp: 2.5,
  /** A node going dark counts as a failed attempt only while the explorer is this close to the hub. */
  failRange: WORKS.radius + 25,
}

/**
 * Each pulse charges the nodes in range when its wavefront reaches them; the charge holds briefly, then fades.
 * All three lit at once closes the circuit: the core wakes and the Undervault door sinks open.
 */
class DormantGrid {
  private solved: boolean
  private readonly chargedAt: number[]
  private readonly lit: boolean[]
  private readonly pending: { node: number; at: number }[] = []
  private powerFrom = -Infinity
  private powering = false
  private readonly unsubscribe: () => void

  constructor(
    private readonly works: ConduitWorks,
    private readonly context: PuzzleContext,
  ) {
    this.solved = context.progress.isSolved('dormant-grid')
    this.chargedAt = works.nodes.map(() => -Infinity)
    this.lit = works.nodes.map(() => false)
    if (this.solved) {
      for (const node of works.nodes) node.setCharge(1)
      works.setPower(1)
      works.door.open(true)
    }
    this.unsubscribe = context.events.on('pulse', ({ origin, time }) => this.onPulse(origin, time))
  }

  update(clock: number, player: THREE.Vector3) {
    if (this.solved) {
      if (!this.powering) return
      const t = Math.min(1, (clock - this.powerFrom) / GRID.powerUp)
      this.works.setPower(t)
      this.powering = t < 1
      return
    }
    const { events } = this.context
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const hit = this.pending[i]
      if (hit.at > clock) continue
      this.pending.splice(i, 1)
      this.chargedAt[hit.node] = hit.at
      this.lit[hit.node] = true
      events.emit('puzzleStep', { id: 'dormant-grid', ok: true, index: hit.node })
    }
    let complete = true
    this.works.nodes.forEach((node, index) => {
      const since = clock - this.chargedAt[index]
      const level = THREE.MathUtils.clamp(1 - (since - GRID.hold) / GRID.fade, 0, 1)
      if (level <= 0) {
        complete = false
        if (this.lit[index]) {
          this.lit[index] = false
          if (Math.hypot(player.x - WORKS.x, player.z - WORKS.z) < GRID.failRange) {
            events.emit('puzzleStep', { id: 'dormant-grid', ok: false, index })
          }
        }
      }
      const flicker = level > 0 && level < GRID.flickerBelow ? 0.55 + 0.45 * Math.sin(clock * 23 + index * 2.1) : 1
      node.setCharge(level * flicker)
    })
    if (complete) this.complete(clock)
  }

  dispose() {
    this.unsubscribe()
  }

  private onPulse(origin: Vec3, time: number) {
    if (this.solved) return
    this.works.nodes.forEach((node, index) => {
      const { x, y, z } = node.position
      const distance = Math.hypot(x - origin.x, y - origin.y, z - origin.z)
      if (distance <= GRID.range) this.pending.push({ node: index, at: time + distance / PULSE_SPEED })
    })
  }

  private complete(clock: number) {
    this.solved = true
    this.powering = true
    this.powerFrom = clock
    this.pending.length = 0
    for (const node of this.works.nodes) node.setCharge(1)
    this.works.door.open()
    this.context.events.emit('puzzleSolved', { id: 'dormant-grid' })
  }
}

// --- All puzzles ---------------------------------------------------------------------------------

/** The three Echo Pulse puzzles. Built once after the World; solved state is restored from the saved progress. */
export class Puzzles {
  readonly choir: ChoirSequence
  readonly bridge: GlassBridgePuzzle
  readonly grid: DormantGrid

  constructor(
    scene: THREE.Scene,
    world: World,
    events: Emitter<GameEvents>,
    progress: ProgressView,
    interactables: Interactables,
  ) {
    const context: PuzzleContext = { scene, events, progress, interactables }
    this.choir = new ChoirSequence(world.hall, context)
    this.bridge = new GlassBridgePuzzle(world.bridge, context)
    this.grid = new DormantGrid(world.works, context)
  }

  /** `clock` = echo play clock (frozen while paused); `player` = the explorer's feet. */
  update(clock: number, dt: number, player: THREE.Vector3) {
    this.choir.update(clock, dt)
    this.bridge.update(player)
    this.grid.update(clock, player)
  }

  dispose() {
    this.choir.dispose()
    this.bridge.dispose()
    this.grid.dispose()
  }
}
