'use client'

import { QUALITY_LEVELS, QUALITY_PRESETS } from '@/game/render/quality'
import { cn } from '@/lib/utils'
import { useGame } from './game-context'
import { useUI } from './use-ui'

/** Minimal pause menu with graphics settings. The full menu (journal, controls, audio) arrives in M5a. */
export function PauseMenu() {
  const game = useGame()
  const phase = useUI((state) => state.phase)
  const quality = useUI((state) => state.quality)
  const renderScale = useUI((state) => state.renderScale)

  if (phase !== 'paused') return null

  const resume = () => {
    // Drop focus so Space reaches the game instead of re-clicking this button.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    game?.resume()
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/55 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        className="w-full max-w-sm rounded-xl border border-border bg-card/85 p-6 shadow-2xl backdrop-blur-md"
      >
        <h2 id="pause-title" className="font-display text-sm tracking-[0.4em] text-foreground">
          PAUSED
        </h2>

        <fieldset className="mt-6">
          <legend className="text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">Graphics quality</legend>
          <div role="radiogroup" aria-label="Graphics quality" className="mt-2 grid grid-cols-4 gap-1.5">
            {QUALITY_LEVELS.map((level) => {
              const selected = quality === level
              return (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => game?.setQuality(level)}
                  className={cn(
                    'rounded-md border px-2 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                    selected
                      ? 'border-primary/70 bg-primary/15 text-primary'
                      : 'border-border text-foreground/80 hover:border-foreground/30 hover:text-foreground',
                  )}
                >
                  {QUALITY_PRESETS[level].label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="flex items-baseline justify-between text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">
            Render scale
            <span className="font-mono tracking-normal text-foreground/85">{Math.round(renderScale * 100)}%</span>
          </span>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={Math.round(renderScale * 100)}
            onChange={(event) => game?.setRenderScale(Number(event.target.value) / 100)}
            className="mt-2 w-full accent-primary"
          />
        </label>

        <button
          type="button"
          autoFocus
          onClick={resume}
          className="mt-7 w-full rounded-md bg-primary py-2.5 text-sm font-medium tracking-wide text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Resume
        </button>
      </section>
    </div>
  )
}
