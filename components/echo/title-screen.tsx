'use client'

import { Headphones } from 'lucide-react'
import { useState } from 'react'
import type { Game } from '@/game/core/Game'
import { TITLE_SCREEN } from '@/game/gameplay/content'
import { useGame } from './game-context'
import { MENU_DANGER as DANGER, MENU_PRIMARY as PRIMARY, MENU_SECONDARY as SECONDARY, dropFocus } from './menu'
import { ControlsPanel, SettingsPanel } from './menu-panels'
import { useUI } from './use-ui'

type TitleView = 'menu' | 'confirm' | 'settings' | 'controls'

/** Title over the live world: Continue (with a save) or Begin, New journey behind a confirmation, Settings, Controls. */
export function TitleScreen({ onNewJourney }: { onNewJourney: () => void }) {
  const game = useGame()
  const booted = useUI((state) => state.booted)
  const phase = useUI((state) => state.phase)
  const canContinue = useUI((state) => state.canContinue)

  if (!booted || phase !== 'title') return null
  return <TitleMenu game={game} canContinue={canContinue} onNewJourney={onNewJourney} />
}

function TitleMenu({ game, canContinue, onNewJourney }: { game: Game | null; canContinue: boolean; onNewJourney: () => void }) {
  const [view, setView] = useState<TitleView>('menu')

  const start = () => {
    dropFocus()
    if (canContinue) game?.continueJourney()
    else game?.beginJourney()
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-linear-to-b from-background/70 via-background/10 to-background/80 px-6 py-16 text-center">
      <div aria-hidden="true" className="flex flex-col items-center gap-5">
        <p className="pl-[0.5em] font-display text-5xl tracking-[0.5em] text-foreground [text-shadow:0_2px_28px_rgb(0_0_0/0.55)] sm:text-7xl">
          ECHO
        </p>
        <p className="pl-[0.45em] font-display text-[0.6rem] tracking-[0.45em] text-foreground/75 [text-shadow:0_1px_10px_rgb(0_0_0/0.6)] sm:text-xs">
          THE WORLD REMEMBERS EVERYTHING
        </p>
      </div>

      {view === 'confirm' && (
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
            <button type="button" autoFocus onClick={() => setView('menu')} className={PRIMARY}>
              {TITLE_SCREEN.cancel}
            </button>
            <button type="button" onClick={onNewJourney} className={DANGER}>
              {TITLE_SCREEN.confirm}
            </button>
          </div>
        </section>
      )}

      {(view === 'settings' || view === 'controls') && (
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="title-panel-heading"
          className="mt-10 flex max-h-[min(30rem,60vh)] w-full max-w-sm flex-col rounded-xl border border-border bg-card/85 text-left shadow-2xl backdrop-blur-md"
        >
          <h2 id="title-panel-heading" className="px-5 pt-5 font-display text-xs uppercase tracking-[0.35em] text-foreground">
            {view === 'settings' ? TITLE_SCREEN.settings : TITLE_SCREEN.controls}
          </h2>
          <div className="mt-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5">
            {view === 'settings' ? <SettingsPanel /> : <ControlsPanel />}
          </div>
          <div className="border-t border-border p-4">
            <button type="button" autoFocus onClick={() => setView('menu')} className={SECONDARY}>
              {TITLE_SCREEN.back}
            </button>
          </div>
        </section>
      )}

      {view === 'menu' && (
        <nav aria-label="Title menu" className="mt-12 flex w-full max-w-xs flex-col gap-2.5">
          <button type="button" autoFocus onClick={start} className={PRIMARY}>
            {canContinue ? TITLE_SCREEN.continue : TITLE_SCREEN.begin}
          </button>
          {canContinue && (
            <button type="button" onClick={() => setView('confirm')} className={SECONDARY}>
              {TITLE_SCREEN.newJourney}
            </button>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setView('settings')} className={SECONDARY}>
              {TITLE_SCREEN.settings}
            </button>
            <button type="button" onClick={() => setView('controls')} className={SECONDARY}>
              {TITLE_SCREEN.controls}
            </button>
          </div>
        </nav>
      )}

      <p className="absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-foreground/65">
        <Headphones className="size-3.5" aria-hidden="true" />
        {TITLE_SCREEN.headphones}
      </p>
    </div>
  )
}
