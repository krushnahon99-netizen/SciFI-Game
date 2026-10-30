// One-shot sound recipes. Every melodic cue is built on the current region's key (ambience.ts REGION_TONES), so
// bells, chimes and the drone never clash.
import type { ReactiveKind } from '../echo/reactive'
import type { Surface } from '../gameplay/ids'
import type { RegionTone } from './ambience'
import { createVoice, envelope, type AudioKit, type Envelope, type Vec3, type Voice } from './kit'

/** Frequency of scale step `degree` above root × 2^octave; steps past the scale wrap into higher octaves. */
function scaleNote(tone: RegionTone, degree: number, octave: number): number {
  const { scale } = tone
  const index = ((degree % scale.length) + scale.length) % scale.length
  return tone.root * 2 ** (octave + Math.floor(degree / scale.length) + scale[index] / 12)
}

function oscillator(
  voice: Voice,
  type: OscillatorType,
  frequency: number,
  t: number,
  level: number,
  shape: Envelope,
  destination: AudioNode = voice.input,
): OscillatorNode {
  const { ctx } = voice
  const source = new OscillatorNode(ctx, { type, frequency })
  source.frequency.setValueAtTime(frequency, t)
  const gain = new GainNode(ctx, { gain: 0 })
  const end = envelope(gain.gain, t, level, shape)
  source.connect(gain).connect(destination)
  voice.play(source, t, end + 0.02)
  return source
}

/** Filtered noise burst; returns the filter so callers can sweep it. */
function noise(voice: Voice, filter: BiquadFilterOptions, t: number, level: number, shape: Envelope): BiquadFilterNode {
  const { ctx, kit } = voice
  const source = new AudioBufferSourceNode(ctx, { buffer: kit.noise, loop: true })
  const biquad = new BiquadFilterNode(ctx, filter)
  if (filter.frequency !== undefined) biquad.frequency.setValueAtTime(filter.frequency, t)
  const gain = new GainNode(ctx, { gain: 0 })
  const end = envelope(gain.gain, t, level, shape)
  source.connect(biquad).connect(gain).connect(voice.input)
  voice.play(source, t, end + 0.02, Math.random() * kit.noise.duration)
  return biquad
}

/** FM bell with an inharmonic modulator: a glassy strike that rings out. */
function bell(voice: Voice, frequency: number, t: number, level: number, decay: number) {
  const { ctx } = voice
  const carrier = new OscillatorNode(ctx, { frequency })
  const modulator = new OscillatorNode(ctx, { frequency: frequency * 3.53 })
  const depth = new GainNode(ctx, { gain: 0 })
  depth.gain.setValueAtTime(frequency * 1.8, t)
  depth.gain.setTargetAtTime(frequency * 0.06, t, 0.2)
  modulator.connect(depth).connect(carrier.frequency)
  const amp = new GainNode(ctx, { gain: 0 })
  const end = envelope(amp.gain, t, level, { attack: 0.003, release: decay }) + 0.02
  carrier.connect(amp).connect(voice.input)
  voice.play(modulator, t, end)
  voice.play(carrier, t, end)
  oscillator(voice, 'sine', frequency * 2.76, t, level * 0.2, { attack: 0.002, release: decay * 0.35 })
}

/** Ghost singers: detuned saw voices through two vowel formants, swelling in and out with vibrato. */
function choir(kit: AudioKit, at: Vec3, tone: RegionTone, t: number) {
  const voice = createVoice(kit, { at, ref: 12, reverb: 0.65 })
  if (!voice) return
  const { ctx } = kit
  const mix = new GainNode(ctx, { gain: 0 })
  const end = envelope(mix.gain, t, 0.35, { attack: 1.2, hold: 1.4, release: 2.4 }) + 0.05
  for (const [frequency, Q] of FORMANTS) mix.connect(new BiquadFilterNode(ctx, { type: 'bandpass', frequency, Q })).connect(voice.input)
  const vibrato = new OscillatorNode(ctx, { frequency: 5.2 })
  const vibratoDepth = new GainNode(ctx, { gain: 9 })
  vibrato.connect(vibratoDepth)
  voice.play(vibrato, t, end)
  for (const semitone of [12, 19, 24]) {
    for (const detune of [-8, 7]) {
      const singer = new OscillatorNode(ctx, { type: 'sawtooth', frequency: tone.root * 2 ** (semitone / 12), detune })
      vibratoDepth.connect(singer.detune)
      singer.connect(mix)
      voice.play(singer, t, end)
    }
  }
}

const FORMANTS: ReadonlyArray<readonly [number, number]> = [
  [650, 5],
  [1080, 6],
]

function positionHash({ x, z }: Vec3): number {
  const h = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return Math.floor((h - Math.floor(h)) * 1000)
}

// --- Cues --------------------------------------------------------------------------------------

const PULSE_PARTIALS = [0, 7, 12, 19]

/** Echo Pulse: sub thump with a falling pitch, plus a rising noise sweep and partials that feed the echo. */
export function pulse(kit: AudioKit, tone: RegionTone) {
  const t = kit.ctx.currentTime + 0.01
  const thump = createVoice(kit, { reverb: 0.3 }, true)
  if (thump) {
    const sub = oscillator(thump, 'sine', 92, t, 0.85, { attack: 0.01, release: 1.1 })
    sub.frequency.exponentialRampToValueAtTime(36, t + 0.6)
    noise(thump, { type: 'lowpass', frequency: 300 }, t, 0.4, { attack: 0.004, release: 0.4 })
  }
  const shimmer = createVoice(kit, { reverb: 0.55, echo: 0.5 }, true)
  if (!shimmer) return
  const sweep = noise(shimmer, { type: 'bandpass', frequency: 500, Q: 2.2 }, t, 0.28, { attack: 0.3, hold: 0.5, release: 0.9 })
  sweep.frequency.exponentialRampToValueAtTime(6500, t + 1.5)
  PULSE_PARTIALS.forEach((semitone, i) => {
    const frequency = tone.root * 16 * 2 ** (semitone / 12)
    const partial = oscillator(shimmer, 'sine', frequency * 0.7, t + i * 0.05, 0.06, { attack: 0.35, hold: 0.3, release: 1.5 })
    partial.frequency.exponentialRampToValueAtTime(frequency, t + 1.1)
  })
}

/** The wavefront reaching a reactive object, at its position. */
export function reveal(kit: AudioKit, kind: ReactiveKind, at: Vec3, tone: RegionTone) {
  const t = kit.ctx.currentTime + 0.005
  switch (kind) {
    case 'crystals': {
      const voice = createVoice(kit, { at, ref: 9, reverb: 0.5 })
      if (!voice) return
      // Each formation always rings the same note.
      const degree = positionHash(at) % 7
      bell(voice, scaleNote(tone, degree, 3), t, 0.3, 4)
      bell(voice, scaleNote(tone, degree + 2, 4), t + 0.04 + Math.random() * 0.05, 0.08, 3)
      return
    }
    case 'glyphs': {
      const voice = createVoice(kit, { at, ref: 7, reverb: 0.45 })
      if (!voice) return
      for (let i = 0; i < 7; i++) {
        const frequency = scaleNote(tone, Math.floor(Math.random() * 8), 4)
        oscillator(voice, 'sine', frequency, t + Math.random() * 0.9, 0.045, { attack: 0.004, release: 0.35 })
      }
      noise(voice, { type: 'highpass', frequency: 5000 }, t, 0.035, { attack: 0.2, hold: 0.3, release: 0.6 })
      return
    }
    case 'ghosts':
      choir(kit, at, tone, t)
      return
    case 'pastState': {
      const voice = createVoice(kit, { at, ref: 16, reverb: 0.6, echo: 0.15 })
      if (!voice) return
      tone.chord.forEach((semitone, i) => {
        const frequency = tone.root * 4 * 2 ** (semitone / 12)
        oscillator(voice, 'sine', frequency, t + i * 0.12, 0.06, { attack: 1.6, hold: 1, release: 3 })
      })
      const air = noise(voice, { type: 'bandpass', frequency: 900, Q: 0.8 }, t, 0.05, { attack: 1.4, hold: 0.8, release: 2.5 })
      air.frequency.exponentialRampToValueAtTime(3200, t + 3)
      return
    }
    case 'phase': {
      const voice = createVoice(kit, { at, ref: 8, reverb: 0.4 })
      if (!voice) return
      const frequency = scaleNote(tone, 0, 3)
      for (const ratio of [1, 1.006]) {
        oscillator(voice, 'sine', frequency * ratio, t, 0.08, { attack: 0.25, hold: 0.5, release: 1.2 })
      }
      noise(voice, { type: 'bandpass', frequency: 2600, Q: 3 }, t, 0.05, { attack: 0.15, release: 0.6 })
      return
    }
    case 'trigger': {
      const voice = createVoice(kit, { at, ref: 8, reverb: 0.4 })
      if (voice) bell(voice, scaleNote(tone, 0, 2), t, 0.22, 2.5)
    }
  }
}

interface StepSound {
  /** Band-pass centre (Hz), Q, decay (s) and level of the scuff. */
  band: number
  q: number
  decay: number
  level: number
  /** Level of the low heel thud. */
  thud: number
  /** Resonant partials (Hz) for hard, ringing surfaces. */
  ring: readonly number[]
}

const STEPS: Readonly<Record<Surface, StepSound>> = {
  stone: { band: 1500, q: 1.1, decay: 0.07, level: 0.35, thud: 0.8, ring: [] },
  sand: { band: 2800, q: 0.6, decay: 0.14, level: 0.25, thud: 0.3, ring: [] },
  crystal: { band: 3600, q: 1.8, decay: 0.05, level: 0.2, thud: 0.4, ring: [2350, 3510] },
  metal: { band: 2200, q: 2.4, decay: 0.07, level: 0.28, thud: 0.6, ring: [420, 1130] },
  glass: { band: 4400, q: 2.2, decay: 0.04, level: 0.18, thud: 0.2, ring: [3150, 4720] },
}

export function footstep(kit: AudioKit, surface: Surface, run: boolean) {
  const voice = createVoice(kit, { reverb: 0.12 })
  if (!voice) return
  const step = STEPS[surface]
  const t = kit.ctx.currentTime + 0.002
  const level = (run ? 1.3 : 1) * (0.85 + Math.random() * 0.3)
  const vary = 0.88 + Math.random() * 0.24
  const scuff = { attack: 0.003, release: step.decay * (run ? 0.85 : 1) }
  noise(voice, { type: 'bandpass', frequency: step.band * vary, Q: step.q }, t, step.level * level, scuff)
  noise(voice, { type: 'lowpass', frequency: 200 * vary }, t, step.thud * level, { attack: 0.004, release: 0.09 })
  step.ring.forEach((frequency, i) => {
    oscillator(voice, 'sine', frequency * vary, t, (step.level * 0.25) / (i + 1), { attack: 0.002, release: 0.22 })
  })
}

/** Touchdown thud scaled by the downward speed (m/s); small hops stay silent. */
export function land(kit: AudioKit, impact: number) {
  const strength = Math.min(1, Math.max(0, (impact - 2.5) / 9))
  if (strength <= 0) return
  const voice = createVoice(kit, { reverb: 0.2 })
  if (!voice) return
  const t = kit.ctx.currentTime + 0.002
  const sub = oscillator(voice, 'sine', 85, t, 0.55 * strength, { attack: 0.004, release: 0.35 })
  sub.frequency.exponentialRampToValueAtTime(40, t + 0.25)
  noise(voice, { type: 'lowpass', frequency: 420 }, t, 0.6 * strength, { attack: 0.003, release: 0.28 })
  noise(voice, { type: 'bandpass', frequency: 1700, Q: 0.9 }, t + 0.01, 0.25 * strength, { attack: 0.003, release: 0.2 })
}

/** Correct steps climb the scale (`step` = correct steps in a row); a wrong step is a falling, dissonant buzz. */
export function puzzleStep(kit: AudioKit, tone: RegionTone, ok: boolean, step: number) {
  const voice = createVoice(kit, { reverb: 0.4, echo: ok ? 0.2 : 0 }, true)
  if (!voice) return
  const t = kit.ctx.currentTime + 0.005
  if (ok) {
    const frequency = scaleNote(tone, step, 3)
    bell(voice, frequency, t, 0.26, 2.4)
    oscillator(voice, 'triangle', frequency / 2, t, 0.08, { attack: 0.01, release: 1.2 })
    return
  }
  const lowpass = new BiquadFilterNode(kit.ctx, { type: 'lowpass', frequency: 900 })
  lowpass.connect(voice.input)
  for (const frequency of [110, 116.5]) {
    const buzz = oscillator(voice, 'sawtooth', frequency, t, 0.14, { attack: 0.01, hold: 0.15, release: 0.45 }, lowpass)
    buzz.frequency.exponentialRampToValueAtTime(frequency * 0.78, t + 0.55)
  }
}

/** Rising bell arpeggio over a warm chord; `size` stretches it (the finale uses a bigger one). */
export function solved(kit: AudioKit, tone: RegionTone, size = 1) {
  const voice = createVoice(kit, { reverb: 0.6, echo: 0.35 }, true)
  if (!voice) return
  const t = kit.ctx.currentTime + 0.01
  for (let i = 0; i < 6; i++) bell(voice, scaleNote(tone, i, 3), t + i * 0.13 * size, 0.2, 3 * size)
  tone.chord.forEach((semitone, i) => {
    const frequency = tone.root * 4 * 2 ** (semitone / 12)
    oscillator(voice, i === 0 ? 'triangle' : 'sine', frequency, t, 0.05, { attack: 0.8 * size, hold: 1.2 * size, release: 3 * size })
  })
}

interface Chime {
  degrees: readonly number[]
  octave: number
  spacing: number
  level: number
}

const DISCOVERY: Readonly<Record<'fragment' | 'secret' | 'item', Chime>> = {
  fragment: { degrees: [0, 2, 4], octave: 3, spacing: 0.12, level: 0.17 },
  secret: { degrees: [4, 1, 3, 6], octave: 3, spacing: 0.17, level: 0.16 },
  item: { degrees: [0, 2, 4, 5, 7], octave: 2, spacing: 0.1, level: 0.2 },
}

export function discovery(kit: AudioKit, kind: keyof typeof DISCOVERY, tone: RegionTone) {
  const voice = createVoice(kit, { bus: 'ui', reverb: 0.5, echo: 0.25 }, true)
  if (!voice) return
  const t = kit.ctx.currentTime + 0.01
  const chime = DISCOVERY[kind]
  chime.degrees.forEach((degree, i) => {
    bell(voice, scaleNote(tone, degree, chime.octave), t + i * chime.spacing, chime.level, 2.6)
  })
  if (kind === 'item') oscillator(voice, 'sine', tone.root * 2, t, 0.22, { attack: 0.6, hold: 0.8, release: 2.5 })
}

/** Pause menu open (falling blip pair) / close (rising). */
export function uiCue(kit: AudioKit, kind: 'open' | 'close') {
  const voice = createVoice(kit, { bus: 'ui', reverb: 0.15 }, true)
  if (!voice) return
  const t = kit.ctx.currentTime + 0.005
  const [first, second] = kind === 'open' ? [880, 587.33] : [587.33, 880]
  oscillator(voice, 'sine', first, t, 0.12, { attack: 0.004, release: 0.12 })
  oscillator(voice, 'sine', second, t + 0.07, 0.12, { attack: 0.004, release: 0.2 })
}
