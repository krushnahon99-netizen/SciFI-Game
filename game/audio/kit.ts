// Shared Web Audio plumbing for the procedural sound engine. There are no audio files: everything is synthesised.

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type BusName = 'sfx' | 'ui' | 'ambience' | 'reverb' | 'echo'

/** The audio graph every sound plays through, built once the AudioContext exists (audio.ts). */
export interface AudioKit {
  readonly ctx: AudioContext
  /** Two seconds of white noise shared by every noise voice (each starts at a random offset). */
  readonly noise: AudioBuffer
  readonly buses: Readonly<Record<BusName, AudioNode>>
  /** One-shot voices still sounding; non-essential sounds are skipped above MAX_VOICES. */
  voices: number
}

const MAX_VOICES = 28

export interface Envelope {
  attack: number
  /** Seconds at full level after the attack. */
  hold?: number
  /** Exponential release: about 2 % of the level remains after this many seconds. */
  release: number
}

/** Shapes `param` from 0 up to `level` and back down; returns the time it is silent again. */
export function envelope(param: AudioParam, t: number, level: number, { attack, hold = 0, release }: Envelope): number {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(level, t + attack)
  if (hold > 0) param.setValueAtTime(level, t + attack + hold)
  param.setTargetAtTime(0, t + attack + hold, release / 4)
  return t + attack + hold + release
}

/** Cancels pending automation without a jump, then ramps linearly to `value`. */
export function rampTo(param: AudioParam, value: number, now: number, seconds: number) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now)
  } else {
    param.cancelScheduledValues(now)
    param.setValueAtTime(param.value, now)
  }
  param.linearRampToValueAtTime(value, now + seconds)
}

export function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

/** Leaky-integrated noise (deep rumble for the wind), de-trended so it loops without a click. */
export function brownNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let level = 0
  for (let i = 0; i < data.length; i++) {
    level = (level + 0.02 * (Math.random() * 2 - 1)) / 1.02
    data[i] = level * 3.5
  }
  const last = data.length - 1
  const drift = data[last] - data[0]
  for (let i = 0; i <= last; i++) data[i] -= drift * (i / last)
  return buffer
}

/** Stereo stone-hall impulse: decaying noise, low-passed so the tail stays dark. */
export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let low = 0
    for (let i = 0; i < length; i++) {
      low += 0.3 * (Math.random() * 2 - 1 - low)
      data[i] = low * (1 - i / length) ** decay
    }
  }
  return buffer
}

export interface VoiceOptions {
  bus?: 'sfx' | 'ui'
  /** World position: the voice goes through a PannerNode. Omit for the player's own, non-spatial sounds. */
  at?: Vec3 | null
  /** Distance in metres up to which a positioned voice plays at full level. */
  ref?: number
  /** Send levels into the shared reverb and echo. */
  reverb?: number
  echo?: number
}

/**
 * One sound: its sources connect to `input`, which feeds the bus (through a panner when positioned) and the
 * reverb / echo sends. The voice disconnects itself when its last scheduled source ends.
 */
export class Voice {
  readonly input: GainNode
  private readonly nodes: AudioNode[] = []
  private last: AudioScheduledSourceNode | null = null
  private lastStop = -1
  private finished = false

  constructor(
    readonly kit: AudioKit,
    options: VoiceOptions,
  ) {
    const { ctx, buses } = kit
    this.input = new GainNode(ctx)
    this.nodes.push(this.input)
    let output: AudioNode = this.input
    if (options.at) {
      const { x, y, z } = options.at
      const panner = new PannerNode(ctx, {
        panningModel: 'equalpower',
        distanceModel: 'inverse',
        refDistance: options.ref ?? 6,
        rolloffFactor: 1,
        maxDistance: 600,
        positionX: x,
        positionY: y,
        positionZ: z,
      })
      this.input.connect(panner)
      this.nodes.push(panner)
      output = panner
    }
    output.connect(buses[options.bus ?? 'sfx'])
    if (options.reverb) this.send(output, buses.reverb, options.reverb)
    if (options.echo) this.send(output, buses.echo, options.echo)
    kit.voices++
  }

  get ctx(): AudioContext {
    return this.kit.ctx
  }

  /** Starts `source` at `start` (buffer sources `offset` seconds in) and stops it at `stop`. */
  play(source: AudioScheduledSourceNode, start: number, stop: number, offset = 0) {
    if (source instanceof AudioBufferSourceNode) source.start(start, offset)
    else source.start(start)
    source.stop(stop)
    if (stop <= this.lastStop) return
    if (this.last) this.last.onended = null
    this.last = source
    this.lastStop = stop
    source.onended = this.finish
  }

  private send(from: AudioNode, to: AudioNode, amount: number) {
    const gain = new GainNode(this.kit.ctx, { gain: amount })
    from.connect(gain).connect(to)
    this.nodes.push(gain)
  }

  private readonly finish = () => {
    if (this.finished) return
    this.finished = true
    for (const node of this.nodes) node.disconnect()
    this.kit.voices--
  }
}

/** A new voice, or null when the mix is full and the sound isn't `essential` (pulse, puzzle and discovery cues). */
export function createVoice(kit: AudioKit, options: VoiceOptions = {}, essential = false): Voice | null {
  if (!essential && kit.voices >= MAX_VOICES) return null
  return new Voice(kit, options)
}
