import type { RegionId } from '../gameplay/ids'
import { rampTo } from './kit'

/** A region's key: its drone chord, and the scale every bell, chime and puzzle cue there is built from. */
export interface RegionTone {
  /** Drone root in Hz. */
  readonly root: number
  /** Drone chord in semitones above the root; the first note is a soft triangle bass. */
  readonly chord: readonly number[]
  /** Five-note scale (semitones) for melodic cues. */
  readonly scale: readonly number[]
  /** Drone low-pass cutoff in Hz: darker → brighter. */
  readonly cutoff: number
  /** Wind level 0–1: open ground is loud, underground almost still. */
  readonly wind: number
}

const MINOR = [0, 3, 5, 7, 10]
const MAJOR = [0, 2, 4, 7, 9]

export const REGION_TONES: Readonly<Record<RegionId, RegionTone>> = {
  cradle: { root: 73.42, chord: [0, 7, 12, 15, 19], scale: MINOR, cutoff: 680, wind: 0.85 },
  hall: { root: 65.41, chord: [0, 7, 10, 15], scale: MINOR, cutoff: 480, wind: 0.45 },
  vale: { root: 82.41, chord: [0, 7, 11, 14, 18], scale: MAJOR, cutoff: 1150, wind: 0.6 },
  chasm: { root: 58.27, chord: [0, 7, 14, 17], scale: [0, 2, 5, 7, 10], cutoff: 620, wind: 1 },
  works: { root: 55, chord: [0, 7, 13, 15], scale: [0, 1, 5, 7, 8], cutoff: 820, wind: 0.5 },
  undervault: { root: 43.65, chord: [0, 7, 12, 15], scale: MINOR, cutoff: 360, wind: 0.12 },
  spire: { root: 73.42, chord: [0, 7, 14, 16, 21], scale: MAJOR, cutoff: 1350, wind: 1 },
}

const DETUNE_CENTS = [-5, 4, -3, 6, -7]
const FIRST_FADE_SECONDS = 4
const CROSSFADE_SECONDS = 5

/** One sustained chord: detuned oscillators through a breathing low-pass, each note drifting on its own LFOs. */
class Drone {
  private readonly output: GainNode
  private readonly sources: OscillatorNode[] = []

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    tone: RegionTone,
    fadeSeconds: number,
  ) {
    const now = ctx.currentTime
    this.output = new GainNode(ctx, { gain: 0 })
    this.output.gain.setValueAtTime(0, now)
    this.output.gain.linearRampToValueAtTime(1, now + fadeSeconds)
    this.output.connect(destination)
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: tone.cutoff, Q: 0.8 })
    filter.connect(this.output)
    this.lfo(filter.frequency, 0.04 + Math.random() * 0.03, tone.cutoff * 0.4)
    tone.chord.forEach((semitone, index) => {
      const bass = index === 0
      const level = bass ? 0.16 : 0.07
      const oscillator = new OscillatorNode(ctx, {
        type: bass ? 'triangle' : 'sawtooth',
        frequency: tone.root * 2 ** (semitone / 12),
        detune: DETUNE_CENTS[index % DETUNE_CENTS.length],
      })
      const gain = new GainNode(ctx, { gain: level })
      oscillator.connect(gain).connect(filter)
      this.lfo(gain.gain, 0.05 + index * 0.021, level * 0.55)
      this.lfo(oscillator.detune, 0.09 + index * 0.017, 5)
      this.start(oscillator)
    })
  }

  fadeOut(seconds: number) {
    const now = this.ctx.currentTime
    rampTo(this.output.gain, 0, now, seconds)
    for (const source of this.sources) source.stop(now + seconds + 0.05)
    const output = this.output
    this.sources[0].onended = () => output.disconnect()
  }

  private lfo(param: AudioParam, rate: number, depth: number) {
    const oscillator = new OscillatorNode(this.ctx, { frequency: rate })
    const gain = new GainNode(this.ctx, { gain: depth })
    oscillator.connect(gain).connect(param)
    this.start(oscillator)
  }

  private start(source: OscillatorNode) {
    source.start()
    this.sources.push(source)
  }
}

/** Looped noise in two layers (low body + a narrow whistle) with random gusts and a slowly wandering stereo position. */
class Wind {
  private readonly pan: StereoPannerNode
  private readonly bodyFilter: BiquadFilterNode
  private readonly bodyGain: GainNode
  private readonly whistleFilter: BiquadFilterNode
  private readonly whistleGain: GainNode
  private nextGust = 0

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    brown: AudioBuffer,
    white: AudioBuffer,
    private strength: number,
  ) {
    this.pan = new StereoPannerNode(ctx)
    this.pan.connect(destination)
    const body = new AudioBufferSourceNode(ctx, { buffer: brown, loop: true })
    this.bodyFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 420, Q: 0.6 })
    this.bodyGain = new GainNode(ctx, { gain: 0 })
    body.connect(this.bodyFilter).connect(this.bodyGain).connect(this.pan)
    const whistle = new AudioBufferSourceNode(ctx, { buffer: white, loop: true, playbackRate: 0.5 })
    this.whistleFilter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1300, Q: 16 })
    this.whistleGain = new GainNode(ctx, { gain: 0 })
    whistle.connect(this.whistleFilter).connect(this.whistleGain).connect(this.pan)
    body.start()
    whistle.start()
  }

  setStrength(strength: number) {
    this.strength = strength
    this.nextGust = 0
  }

  update(dt: number) {
    this.nextGust -= dt
    if (this.nextGust > 0) return
    const duration = 3 + Math.random() * 6
    this.nextGust = duration
    const now = this.ctx.currentTime
    const ease = duration * 0.3
    const level = this.strength * (0.3 + Math.random() * 0.7)
    this.bodyGain.gain.setTargetAtTime(level * 0.4, now, ease)
    this.bodyFilter.frequency.setTargetAtTime(260 + level * 650 + Math.random() * 120, now, ease)
    this.whistleGain.gain.setTargetAtTime(Math.random() < 0.45 ? level * 1.4 : 0, now, ease)
    this.whistleFilter.frequency.setTargetAtTime(900 + Math.random() * 1400, now, duration * 0.5)
    this.pan.pan.setTargetAtTime(Math.random() * 1.2 - 0.6, now, duration * 0.4)
  }
}

/** The region drone and the wind. `setTone` crossfades to another region's chord. */
export class Ambience {
  private drone: Drone
  private readonly wind: Wind

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    noise: { white: AudioBuffer; brown: AudioBuffer },
    private tone: RegionTone,
  ) {
    this.drone = new Drone(ctx, destination, tone, FIRST_FADE_SECONDS)
    this.wind = new Wind(ctx, destination, noise.brown, noise.white, tone.wind)
  }

  setTone(tone: RegionTone) {
    if (tone === this.tone) return
    this.tone = tone
    this.drone.fadeOut(CROSSFADE_SECONDS)
    this.drone = new Drone(this.ctx, this.destination, tone, CROSSFADE_SECONDS)
    this.wind.setStrength(tone.wind)
  }

  update(dt: number) {
    this.wind.update(dt)
  }
}
