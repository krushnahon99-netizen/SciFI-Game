import { QUALITY_LEVELS, type QualityLevel } from './quality'

/** Average FPS below this for STRIKES windows in a row steps the preset down one level. */
const MIN_FPS = 28
const WINDOW_SECONDS = 3
const STRIKES = 2
/** Shader compiles and uploads right after a start or a preset change cause hitches: don't judge those seconds. */
const SETTLE_SECONDS = 4
/**
 * A frame gap this long is a stall (tab switch, dialog, debugger), not load: restart the window. It must stay far
 * above real frame times: a software renderer at High takes ~2 s per frame, and that device needs Auto the most.
 */
export const STALL_SECONDS = 5

/** "Auto" graphics: watches real frame times while playing and only ever steps the preset down. */
export class AutoQuality {
  private settle = SETTLE_SECONDS
  private frames = 0
  private seconds = 0
  private strikes = 0

  /** Judge afresh after a short settle (new preset, play resumed). */
  reset() {
    this.settle = SETTLE_SECONDS
    this.frames = 0
    this.seconds = 0
    this.strikes = 0
  }

  /** Feed one frame's wall-clock duration; returns the lower level to switch to, or null. */
  sample(frameSeconds: number, current: QualityLevel): QualityLevel | null {
    if (current === QUALITY_LEVELS[0]) return null
    if (frameSeconds > STALL_SECONDS) {
      this.frames = 0
      this.seconds = 0
      return null
    }
    if (this.settle > 0) {
      this.settle -= frameSeconds
      return null
    }
    this.frames++
    this.seconds += frameSeconds
    if (this.seconds < WINDOW_SECONDS) return null
    const fps = this.frames / this.seconds
    this.frames = 0
    this.seconds = 0
    this.strikes = fps < MIN_FPS ? this.strikes + 1 : 0
    if (this.strikes < STRIKES) return null
    this.reset()
    return QUALITY_LEVELS[QUALITY_LEVELS.indexOf(current) - 1]
  }
}
