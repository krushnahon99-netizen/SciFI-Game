'use client'

import { Volume2, VolumeX } from 'lucide-react'
import { SETTINGS_TEXT } from '@/game/gameplay/content'
import { QUALITY_LEVELS, QUALITY_PRESETS } from '@/game/render/quality'
import { cn } from '@/lib/utils'
import { useGame } from './game-context'
import { useUI } from './use-ui'

/** Minimal pause menu with audio and graphics settings. The full menu (journal, controls) arrives in M5a. */
export function PauseMenu() {
  const game = useGame()
  const phase = useUI((state) => state.phase)
  const quality = useUI((state) => state.quality)
  const renderScale = useUI((state) => state.renderScale)
  const volume = useUI((state) => state.volume)
  const muted = useUI((state) => state.muted)

  if (phase !== 'paused') return null

  const resume = () => {
    // Drop focus so Space reaches the game instead of re-clicking this button.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    game?.resume()
  }
  const volumePercent = Math.round(volume * 100)

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
          <legend className="text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">{SETTINGS_TEXT.audio}</legend>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={muted}
              aria-label={SETTINGS_TEXT.mute}
              onClick={() => game?.toggleMute()}
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                muted
                  ? 'border-primary/70 bg-primary/15 text-primary'
                  : 'border-border text-foreground/80 hover:border-foreground/30 hover:text-foreground',
              )}
            >
              {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volumePercent}
              aria-label={SETTINGS_TEXT.volume}
              aria-valuetext={muted ? SETTINGS_TEXT.muted : `${volumePercent}%`}
              onChange={(event) => game?.setVolume(Number(event.target.value) / 100)}
              className={cn('min-w-0 flex-1 accent-primary', muted && 'opacity-50')}
            />
            <span className="w-12 shrink-0 text-right font-mono text-xs text-foreground/85">
              {muted ? SETTINGS_TEXT.muted : `${volumePercent}%`}
            </span>
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground">{SETTINGS_TEXT.graphics}</legend>
          <div role="radiogroup" aria-label={SETTINGS_TEXT.graphics} className="mt-2 grid grid-cols-4 gap-1.5">
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
            {SETTINGS_TEXT.renderScale}
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
