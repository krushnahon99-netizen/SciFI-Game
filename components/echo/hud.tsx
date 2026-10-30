'use client'

import { PerfOverlay } from './perf-overlay'
import { useUI } from './use-ui'

export function Hud() {
  const booted = useUI((state) => state.booted)
  const phase = useUI((state) => state.phase)
  const pointerLocked = useUI((state) => state.pointerLocked)
  const lookMode = useUI((state) => state.lookMode)

  if (!booted) return null
  const showHint = phase === 'playing' && !pointerLocked

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <PerfOverlay />
      {showHint && (
        <p className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] px-4 text-center text-[0.68rem] uppercase tracking-[0.25em] text-foreground/75 [text-shadow:0_1px_8px_rgb(0_0_0/0.6)]">
          {lookMode === 'pointer-lock' ? 'Click to look around' : 'Drag to look'}
          <span className="text-primary"> · </span>
          WASD move · Shift run · Space jump · Wheel zoom
          <span className="text-primary"> · </span>
          Esc pause · F3 stats
        </p>
      )}
    </div>
  )
}
