'use client'

import { Headphones } from 'lucide-react'
import { useState } from 'react'
import type { Game } from '@/game/core/Game'
import { TITLE_SCREEN } from '@/game/gameplay/content'
import { useGame } from './game-context'
import { useUI } from './use-ui'

const BUTTON =
  'w-full rounded-md py-3 text-xs uppercase tracking-[0.3em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const PRIMARY = `${BUTTON} bg-primary font-medium text-primary-foreground hover:opacity-90`
const SECONDARY = `${BUTTON} border border-foreground/20 bg-background/35 text-foreground/85 backdrop-blur-sm hover:border-foreground/45 hover:text-foreground`
const DANGER = `${BUTTON} border border-destructive/60 text-destructive hover:bg-destructive/10`

function dropFocus() {
  // Keeps Space / Enter for the game instead of re-pressing the button that started it.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

/** Title over the live world: Continue (with a save) or Begin, and New journey behind a confirmation. */
export function TitleScreen({ onNewJourney }: { onNewJourney: () => void }) {
  const game = useGame()
  const booted = useUI((state) => state.booted)
  const phase = useUI((state) => state.phase)
  const canContinue = useUI((state) => state.canContinue)

  if (!booted || phase !== 'title') return null
  return <TitleMenu game={game} canContinue={canContinue} onNewJourney={onNewJourney} />
}

function TitleMenu({ game, canContinue, onNewJourney }: { game: Game | null; canContinue: boolean; onNewJourney: () => void }) {
  const [confirming, setConfirming] = useState(false)

  const start = () => {
    dropFocus()
    if (canContinue) game?.continueJourney()
    else game?.beginJourney()
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-linear-to-b from-background/70 via-background/10 to-background/80 px-6 text-center">
      <div aria-hidden="true" className="flex flex-col items-center gap-5">
        <p className="pl-[0.5em] font-display text-5xl tracking-[0.5em] text-foreground [text-shadow:0_2px_28px_rgb(0_0_0/0.55)] sm:text-7xl">
          ECHO
        </p>
        <p className="pl-[0.45em] font-display text-[0.6rem] tracking-[0.45em] text-foreground/75 [text-shadow:0_1px_10px_rgb(0_0_0/0.6)] sm:text-xs">
          THE WORLD REMEMBERS EVERYTHING
        </p>
      </div>

      {confirming ? (
        <section
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="new-journey-question"
          className="mt-12 w-full max-w-xs rounded-xl border border-border bg-card/85 p-5 shadow-2xl backdrop-blur-md"
        >
          <p id="new-journey-question" className="text-sm leading-relaxed text-pretty text-foreground/90">
            {TITLE_SCREEN.confirmNew}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <button type="button" autoFocus onClick={() => setConfirming(false)} className={PRIMARY}>
              {TITLE_SCREEN.cancel}
            </button>
            <button type="button" onClick={onNewJourney} className={DANGER}>
              {TITLE_SCREEN.confirm}
            </button>
          </div>
        </section>
      ) : (
        <nav aria-label="Title menu" className="mt-12 flex w-full max-w-xs flex-col gap-2.5">
          <button type="button" autoFocus onClick={start} className={PRIMARY}>
            {canContinue ? TITLE_SCREEN.continue : TITLE_SCREEN.begin}
          </button>
          {canContinue && (
            <button type="button" onClick={() => setConfirming(true)} className={SECONDARY}>
              {TITLE_SCREEN.newJourney}
            </button>
          )}
        </nav>
      )}

      <p className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-foreground/65">
        <Headphones className="size-3.5" aria-hidden="true" />
        {TITLE_SCREEN.headphones}
      </p>
    </div>
  )
}
