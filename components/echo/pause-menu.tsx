'use client'

import { useId, type KeyboardEvent } from 'react'
import { PAUSE } from '@/game/gameplay/content'
import { uiStore, type MenuTab } from '@/game/ui/store'
import { cn } from '@/lib/utils'
import { useGame } from './game-context'
import { MENU_PRIMARY, MENU_SECONDARY, dropFocus } from './menu'
import { ControlsPanel, JournalPanel, SettingsPanel } from './menu-panels'
import { useUI } from './use-ui'

const TABS: readonly { id: MenuTab; label: string }[] = [
  { id: 'journal', label: PAUSE.journal },
  { id: 'settings', label: PAUSE.settings },
  { id: 'controls', label: PAUSE.controls },
]

/** Pause menu: journal / settings / controls tabs, Resume and Return to title. J opens it on the journal. */
export function PauseMenu() {
  const game = useGame()
  const phase = useUI((state) => state.phase)
  const tab = useUI((state) => state.menuTab)
  const cinematic = useUI((state) => state.cinematic)
  const baseId = useId()

  if (phase !== 'paused') return null

  const tabId = (id: MenuTab) => `${baseId}-tab-${id}`
  const select = (id: MenuTab) => uiStore.setState({ menuTab: id })
  const resume = () => {
    dropFocus()
    game?.resume()
  }
  const toTitle = () => {
    dropFocus()
    game?.returnToTitle()
  }
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const index = TABS.findIndex((entry) => entry.id === tab)
    const next = TABS[(index + step + TABS.length) % TABS.length]
    select(next.id)
    document.getElementById(tabId(next.id))?.focus()
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/55 p-4 backdrop-blur-[2px]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="flex h-[min(40rem,100%)] w-full max-w-md flex-col rounded-xl border border-border bg-card/90 shadow-2xl backdrop-blur-md"
      >
        <h2
          id={`${baseId}-title`}
          className="px-5 pt-5 font-display text-sm uppercase tracking-[0.4em] text-foreground sm:px-6 sm:pt-6"
        >
          {PAUSE.title}
        </h2>

        <div
          role="tablist"
          aria-label={PAUSE.title}
          onKeyDown={onTabKey}
          className="mx-5 mt-4 grid grid-cols-3 gap-1 rounded-lg border border-border bg-background/40 p-1 sm:mx-6"
        >
          {TABS.map((entry) => {
            const selected = entry.id === tab
            return (
              <button
                key={entry.id}
                id={tabId(entry.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(entry.id)}
                className={cn(
                  'rounded-md py-2 text-[0.68rem] uppercase tracking-[0.2em] transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  selected ? 'bg-primary/15 text-primary' : 'text-foreground/70 hover:text-foreground',
                )}
              >
                {entry.label}
              </button>
            )
          })}
        </div>

        <div
          id={`${baseId}-panel`}
          role="tabpanel"
          aria-labelledby={tabId(tab)}
          tabIndex={0}
          className="mt-4 min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 focus-visible:outline-none sm:px-6"
        >
          {tab === 'journal' ? <JournalPanel /> : tab === 'settings' ? <SettingsPanel /> : <ControlsPanel />}
        </div>

        <footer className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:px-6">
          <button type="button" autoFocus onClick={resume} className={MENU_PRIMARY}>
            {PAUSE.resume}
          </button>
          {!cinematic && (
            <button type="button" onClick={toTitle} className={MENU_SECONDARY}>
              {PAUSE.toTitle}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
