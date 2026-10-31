'use client'

import { ENDING, FRAGMENT_IDS, REGION_IDS, SECRET_IDS } from '@/game/gameplay/content'
import { useGame } from './game-context'
import { useUI } from './use-ui'

const BUTTON =
  'w-full rounded-md py-3 text-xs uppercase tracking-[0.3em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
const PRIMARY = `${BUTTON} bg-primary font-medium text-primary-foreground hover:opacity-90`
const SECONDARY = `${BUTTON} border border-foreground/20 bg-background/35 text-foreground/85 backdrop-blur-sm hover:border-foreground/45 hover:text-foreground`
const RISE = 'animate-[echo-rise_1.4s_ease-out_both] motion-reduce:animate-none'

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`
}

function dropFocus() {
  // Keeps Space / Enter for the game instead of re-pressing the button that was used.
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

/** Over the live world while the finale wave is still travelling: closing lines, journey stats, free roam or title. */
export function EndScreen() {
  const game = useGame()
  const phase = useUI((state) => state.phase)
  const progress = useUI((state) => state.progress)

  if (phase !== 'ending') return null
  const stats = [
    { label: ENDING.stats.time, value: formatTime(progress?.playTime ?? 0) },
    { label: ENDING.stats.memories, value: `${progress?.fragments.length ?? 0} / ${FRAGMENT_IDS.length}` },
    { label: ENDING.stats.secrets, value: `${progress?.secrets.length ?? 0} / ${SECRET_IDS.length}` },
    { label: ENDING.stats.places, value: `${progress?.regions.length ?? 0} / ${REGION_IDS.length}` },
    { label: ENDING.stats.pulses, value: String(progress?.pulses ?? 0) },
  ]

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="ending-title"
      className="absolute inset-0 z-20 flex flex-col items-center justify-end overflow-y-auto bg-linear-to-b from-transparent via-background/25 to-background/90 px-6 pt-12 pb-[max(2rem,env(safe-area-inset-bottom))] text-center sm:justify-center"
    >
      <h2
        id="ending-title"
        className={`pl-[0.4em] font-display text-xl uppercase tracking-[0.4em] text-foreground [text-shadow:0_2px_28px_rgb(0_0_0/0.6)] sm:text-4xl ${RISE}`}
      >
        {ENDING.title}
      </h2>
      <div className="mt-5 flex max-w-md flex-col gap-2.5">
        {ENDING.lines.map((line, index) => (
          <p
            key={line}
            className={`text-sm leading-relaxed text-pretty text-foreground/85 [text-shadow:0_1px_10px_rgb(0_0_0/0.7)] ${RISE}`}
            style={{ animationDelay: `${0.8 + index * 1.1}s` }}
          >
            {line}
          </p>
        ))}
      </div>
      <dl className={`mt-6 grid w-full max-w-md grid-cols-3 gap-4 sm:grid-cols-5 ${RISE}`} style={{ animationDelay: '3s' }}>
        {stats.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <dt className="text-[0.58rem] uppercase tracking-[0.22em] text-foreground/60">{label}</dt>
            <dd className="font-display text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <nav
        aria-label="Ending"
        className={`mt-6 flex w-full max-w-xs flex-col gap-2.5 ${RISE}`}
        style={{ animationDelay: '3.6s' }}
      >
        <button
          type="button"
          autoFocus
          onClick={() => {
            dropFocus()
            game?.keepExploring()
          }}
          className={PRIMARY}
        >
          {ENDING.keepExploring}
        </button>
        <button
          type="button"
          onClick={() => {
            dropFocus()
            game?.returnToTitle()
          }}
          className={SECONDARY}
        >
          {ENDING.toTitle}
        </button>
      </nav>
    </section>
  )
}
