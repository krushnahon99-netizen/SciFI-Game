'use client'

import { INTRO } from '@/game/gameplay/content'
import { cn } from '@/lib/utils'
import { useGame } from './game-context'
import { useUI } from './use-ui'

/** Letterboxed intro lines over the opening shot. Skip (or Esc) hands control to the player at once. */
export function IntroOverlay() {
  const game = useGame()
  const phase = useUI((state) => state.phase)
  const line = useUI((state) => state.introLine)

  if (phase !== 'intro') return null

  const skip = () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    game?.skipIntro()
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-[11vh] bg-black transition-transform duration-1000 starting:-translate-y-full"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[11vh] bg-black transition-transform duration-1000 starting:translate-y-full"
      />

      <div aria-hidden="true" className="absolute inset-x-0 bottom-[17vh] grid px-6">
        {INTRO.lines.map((text, index) => (
          <p
            key={text}
            className={cn(
              'col-start-1 row-start-1 mx-auto max-w-2xl text-center text-lg leading-relaxed font-light tracking-wide text-balance text-foreground transition-opacity duration-1000 [text-shadow:0_2px_18px_rgb(0_0_0/0.75)] sm:text-2xl',
              index === line ? 'opacity-100' : 'opacity-0',
            )}
          >
            {text}
          </p>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        {line >= 0 ? INTRO.lines[line] : ''}
      </p>

      <button
        type="button"
        onClick={skip}
        className="pointer-events-auto absolute right-[max(1rem,env(safe-area-inset-right))] bottom-[max(0.75rem,calc(5.5vh-1.1rem))] flex items-center gap-2 rounded-md px-3 py-2 text-[0.62rem] uppercase tracking-[0.3em] text-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        {INTRO.skip}
        <kbd className="rounded border border-foreground/25 px-1.5 py-0.5 font-mono text-[0.6rem] tracking-normal">Esc</kbd>
      </button>
    </div>
  )
}
