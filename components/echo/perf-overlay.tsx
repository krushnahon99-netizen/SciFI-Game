'use client'

import { QUALITY_PRESETS } from '@/game/render/quality'
import { cn } from '@/lib/utils'
import { useTouchMode } from './use-touch-mode'
import { useUI } from './use-ui'

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  return String(value)
}

/** Compact FPS readout while playing; F3 expands it into renderer statistics (shown in every phase). */
export function PerfOverlay() {
  const showPerf = useUI((state) => state.showPerf)
  const phase = useUI((state) => state.phase)
  const perf = useUI((state) => state.perf)
  const quality = useUI((state) => state.quality)
  const auto = useUI((state) => state.qualityAuto)
  // The touch Menu button owns the top-right corner.
  const touch = useTouchMode()

  if (!showPerf && phase !== 'playing') return null

  const rows: Array<[string, string]> = [
    ['FPS', String(perf.fps)],
    ['Frame', `${perf.frameMs.toFixed(1)} ms`],
    ['CPU', `${perf.cpuMs.toFixed(2)} ms`],
    ['Draw calls', String(perf.drawCalls)],
    ['Triangles', formatCount(perf.triangles)],
    ['Geometries', String(perf.geometries)],
    ['Textures', String(perf.textures)],
    ['Pixel ratio', perf.pixelRatio.toFixed(2)],
    ['Quality', `${QUALITY_PRESETS[quality].label}${auto ? ' · Auto' : ''}`],
  ]

  return (
    <div
      className={cn(
        'absolute top-[max(0.75rem,env(safe-area-inset-top))] rounded-md border border-border bg-background/55 px-2.5 py-1.5 font-mono text-[0.68rem] leading-relaxed text-foreground/85 tabular-nums backdrop-blur-sm',
        touch
          ? 'right-[calc(max(0.75rem,env(safe-area-inset-right))_+_3.25rem)]'
          : 'right-[max(0.75rem,env(safe-area-inset-right))]',
      )}
    >
      {showPerf ? (
        <div className="flex flex-col gap-1">
          <dl className="grid grid-cols-[auto_auto] gap-x-4">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="max-w-56 truncate text-muted-foreground" title={perf.gpu}>
            {perf.gpu}
          </p>
        </div>
      ) : (
        <p>
          {perf.fps} <span className="text-muted-foreground">FPS</span>
        </p>
      )}
    </div>
  )
}
