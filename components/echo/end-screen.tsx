'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ENDING, FRAGMENT_IDS, REGION_IDS, SECRET_IDS } from '@/game/gameplay/content'
import type { ProgressSnapshot } from '@/game/gameplay/progression'
import { useGame } from './game-context'
import { MENU_PRIMARY, MENU_SECONDARY, dropFocus } from './menu'
import { useUI } from './use-ui'

/** Seconds into the reveal at which each part rises; the world pulse is still crossing the land behind it. */
const REVEAL = { title: 0.8, lines: [2.4, 4.2], stats: 6, actions: 7.2 }
/** The buttons take input once they are visible (an early stray click must not skip the ending). */
const ACTIONS_READY_S = REVEAL.actions + 0.8
const REDUCED_MOTION_READY_S = 0.6
const RISE = 'animate-[echo-rise_1.4s_ease-out_both] motion-reduce:animate-none'

/** Phase 'ending': closing lines and journey stats over the finale's wide shot, then free roam or the title. */
export function EndScreen() {
  const phase = useUI((state) => state.phase)
  const progress = useUI((state) => state.progress)

  if (phase !== 'ending' || !progress) return null
  return <EndCard progress={progress} />
}

function EndCard({ progress }: { progress: ProgressSnapshot }) {
  const game = useGame()
  const [ready, setReady] = useState(false)
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setReady(true), (reduced ? REDUCED_MOTION_READY_S : ACTIONS_READY_S) * 1000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (ready) primaryRef.current?.focus()
  }, [ready])

  const keepExploring = () => {
    dropFocus()
    game?.keepExploring()
  }
  const toTitle = () => {
    dropFocus()
    game?.returnToTitle()
  }

  const time = formatPlayTime(progress.playTime)
  const stats: { label: string; value: ReactNode }[] = [
    { label: ENDING.stats.time, value: <time dateTime={time.iso}>{time.text}</time> },
    { label: ENDING.stats.memories, value: <Count found={progress.fragments.length} total={FRAGMENT_IDS.length} /> },
    { label: ENDING.stats.secrets, value: <Count found={progress.secrets.length} total={SECRET_IDS.length} /> },
    { label: ENDING.stats.places, value: <Count found={progress.regions.length} total={REGION_IDS.length} /> },
    { label: ENDING.stats.pulses, value: progress.pulses.toLocaleString() },
  ]

  return (
    <div className="absolute inset-0 z-20 flex animate-[echo-fade_2.4s_ease-out_both] flex-col items-center overflow-y-auto bg-linear-to-b from-transparent from-5% via-background/60 via-50% to-background/90 px-6 pt-20 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center motion-reduce:animate-none sm:pb-[11vh]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ending-title"
        aria-describedby="ending-lines"
        className="mt-auto flex w-full max-w-xl flex-col items-center [text-shadow:0_1px_12px_rgb(0_0_0/0.55)]"
      >
        <div aria-hidden="true" className={`flex items-center gap-3 ${RISE}`} style={delay(REVEAL.title)}>
          <span className="h-px w-14 bg-linear-to-l from-primary/80 to-transparent" />
          <span className="size-1.5 rotate-45 bg-primary shadow-[0_0_12px_var(--color-primary)]" />
          <span className="h-px w-14 bg-linear-to-r from-primary/80 to-transparent" />
        </div>
        <h2
          id="ending-title"
          className={`mt-5 pl-[0.3em] font-display text-xl uppercase leading-snug tracking-[0.3em] text-balance text-foreground sm:text-3xl ${RISE}`}
          style={delay(REVEAL.title)}
        >
          {ENDING.title}
        </h2>

        <div id="ending-lines" className="mt-6 flex flex-col gap-3 text-sm leading-relaxed text-pretty text-foreground/85 sm:text-base">
          {ENDING.lines.map((line, index) => (
            <p key={line} className={RISE} style={delay(REVEAL.lines[index] ?? REVEAL.stats)}>
              {line}
            </p>
          ))}
        </div>

        <dl
          className={`mt-9 flex w-full flex-wrap justify-center gap-x-8 gap-y-5 border-y border-border py-5 ${RISE}`}
          style={delay(REVEAL.stats)}
        >
          {stats.map(({ label, value }) => (
            <div key={label} className="flex min-w-16 flex-col-reverse items-center gap-1.5">
              <dt className="text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground">{label}</dt>
              <dd className="font-display text-base tracking-[0.08em] text-foreground sm:text-lg">{value}</dd>
            </div>
          ))}
        </dl>

        <div
          inert={!ready}
          className={`mt-9 flex w-full max-w-sm flex-col gap-2.5 sm:max-w-md sm:flex-row ${RISE}`}
          style={delay(REVEAL.actions)}
        >
          <button ref={primaryRef} type="button" onClick={keepExploring} className={MENU_PRIMARY}>
            {ENDING.keepExploring}
          </button>
          <button type="button" onClick={toTitle} className={MENU_SECONDARY}>
            {ENDING.toTitle}
          </button>
        </div>
      </section>
    </div>
  )
}

function Count({ found, total }: { found: number; total: number }) {
  return (
    <>
      {found}
      <span aria-hidden="true" className="text-foreground/45">{`/${total}`}</span>
      <span className="sr-only">{` of ${total}`}</span>
    </>
  )
}

function delay(seconds: number): CSSProperties {
  return { animationDelay: `${seconds}s` }
}

/** "m:ss" (or "h:mm:ss") plus an ISO 8601 duration for `<time dateTime>`. */
function formatPlayTime(seconds: number): { text: string; iso: string } {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return {
    text: hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`,
    iso: `PT${hours}H${minutes}M${secs}S`,
  }
}
