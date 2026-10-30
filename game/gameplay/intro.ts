import * as THREE from 'three'
import { uiStore } from '../ui/store'
import { CRADLE, SPAWN } from '../world/layout'
import { INTRO } from './content'

/** Seconds each intro line owns; its text is visible from TEXT_IN to TEXT_OUT inside the slot. */
const LINE_SECONDS = 4.6
const TEXT_IN = 0.5
const TEXT_OUT = 4
/** On the last line the camera glides down to the explorer, whose first pulse then wakes the Cradle. */
const GLIDE_AT = (INTRO.lines.length - 1) * LINE_SECONDS
const PULSE_AT = GLIDE_AT + 1.8
const END_AT = INTRO.lines.length * LINE_SECONDS + 0.3

export interface Shot {
  readonly position: THREE.Vector3
  readonly target: THREE.Vector3
}

/** Title and intro vista: high behind the explorer at the spawn, looking across the Cradle's standing stones. */
export function titleShot(heightAt: (x: number, z: number) => number): Shot {
  const forwardX = -Math.sin(SPAWN.yaw)
  const forwardZ = -Math.cos(SPAWN.yaw)
  const rightX = Math.cos(SPAWN.yaw)
  const rightZ = -Math.sin(SPAWN.yaw)
  const x = SPAWN.x - forwardX * 9 + rightX * 2.5
  const z = SPAWN.z - forwardZ * 9 + rightZ * 2.5
  const ground = Math.max(heightAt(x, z), heightAt(SPAWN.x, SPAWN.z))
  return {
    position: new THREE.Vector3(x, ground + 4.5, z),
    target: new THREE.Vector3(CRADLE.x, heightAt(CRADLE.x, CRADLE.z) + 9, CRADLE.z),
  }
}

export interface IntroCues {
  /** Start blending the camera from the vista back to the explorer. */
  glide(): void
  /** The explorer's first echo pulse. */
  pulse(): void
  /** Natural end or skip: hand control to the player. */
  finish(): void
}

/** The opening: INTRO lines over the vista, then the camera descends and the explorer's first pulse wakes the Cradle. */
export class Intro {
  private time = 0
  private line = -1
  private glided = false
  private pulsed = false
  private done = false

  constructor(private readonly cues: IntroCues) {
    uiStore.setState({ introLine: -1 })
  }

  update(dt: number) {
    if (this.done) return
    this.time += dt
    const t = this.time
    const slot = Math.floor(t / LINE_SECONDS)
    const within = t - slot * LINE_SECONDS
    this.show(slot < INTRO.lines.length && within >= TEXT_IN && within < TEXT_OUT ? slot : -1)
    if (!this.glided && t >= GLIDE_AT) {
      this.glided = true
      this.cues.glide()
    }
    if (!this.pulsed && t >= PULSE_AT) {
      this.pulsed = true
      this.cues.pulse()
    }
    if (t >= END_AT) this.finish()
  }

  finish() {
    if (this.done) return
    this.done = true
    this.show(-1)
    this.cues.finish()
  }

  private show(line: number) {
    if (line === this.line) return
    this.line = line
    uiStore.setState({ introLine: line })
  }
}
