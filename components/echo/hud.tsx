'use client'

import { AudioIndicator } from './audio-indicator'
import { PerfOverlay } from './perf-overlay'
import { ProgressHud } from './progress-hud'
import { PulseIndicator } from './pulse-indicator'
import { RegionTitle } from './region-title'
import { useUI } from './use-ui'

export function Hud() {
  const booted = useUI((state) => state.booted)
  const phase = useUI((state) => state.phase)
  const pointerLocked = useUI((state) => state.pointerLocked)
  const lookMode = useUI((state) => state.lookMode)

  if (!booted) return null
  const playing = phase === 'playing'
  const showHint = playing && !pointerLocked

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <PerfOverlay />
      <ProgressHud />
      <RegionTitle />
      <div className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-3 px-4">
        {playing && <PulseIndicator />}
        {playing && <AudioIndicator />}
        {showHint && (
          <p className="text-center text-[0.68rem] uppercase tracking-[0.25em] text-foreground/75 [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">
            {lookMode === 'pointer-lock' ? 'Click to look around' : 'Drag to look'}
            <span className="text-primary"> · </span>
            WASD move · Shift run · Space jump · Q pulse · Wheel zoom
            <span className="text-primary"> · </span>
            Esc pause · F3 stats
          </p>
        )}
      </div>
    </div>
  )
}
