'use client'

import { useEffect, useState } from 'react'
import {
  FRAGMENTS,
  ITEMS,
  NOTICE_TEXT,
  OBJECTIVES,
  PUZZLES,
  SECRETS,
  type ObjectiveId,
} from '@/game/gameplay/content'
import type { Notice } from '@/game/gameplay/progression'
import { uiStore } from '@/game/ui/store'
import { useUI } from './use-ui'

const NOTICE_MS: Record<Notice['kind'], number> = {
  fragment: 11000,
  secret: 8000,
  item: 6500,
  solved: 6000,
  info: 7000,
}
/** The objective's detail line collapses after this long, leaving only its title. */
const OBJECTIVE_DETAIL_MS = 12000

const TEXT_SHADOW = '[text-shadow:0_1px_8px_rgb(0_0_0/0.65)]'

/** Top-left HUD column: the current objective, then discovery notices as they arrive. */
export function ProgressHud() {
  const phase = useUI((state) => state.phase)
  const cinematic = useUI((state) => state.cinematic)
  const objective = useUI((state) => state.progress?.objective ?? null)
  const notices = useUI((state) => state.notices)

  // Unmounting while paused stops the notice timers, so nothing expires unseen behind the menu.
  if (phase !== 'playing' || cinematic) return null

  return (
    <div className="absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] flex w-[min(21rem,calc(100vw-9.5rem))] flex-col gap-3">
      {objective && <ObjectiveLine key={objective} id={objective} />}
      <ol aria-live="polite" aria-label="Discoveries" className="flex flex-col gap-2">
        {notices.map((notice) => (
          <NoticeCard key={notice.seq} notice={notice} />
        ))}
      </ol>
    </div>
  )
}

function ObjectiveLine({ id }: { id: ObjectiveId }) {
  const [expanded, setExpanded] = useState(true)
  const text = OBJECTIVES[id]

  useEffect(() => {
    const timer = window.setTimeout(() => setExpanded(false), OBJECTIVE_DETAIL_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <section
      aria-label="Objective"
      className={`animate-[echo-rise_0.7s_ease-out_both] border-l-2 border-primary/70 pl-3 motion-reduce:animate-none ${TEXT_SHADOW}`}
    >
      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-primary">Objective</p>
      <p className="mt-1 font-display text-[0.7rem] leading-snug tracking-[0.12em] text-foreground">{text.title}</p>
      {expanded && <p className="mt-1 text-xs leading-relaxed text-foreground/75">{text.detail}</p>}
    </section>
  )
}

function NoticeCard({ notice }: { notice: Notice }) {
  const duration = NOTICE_MS[notice.kind]

  useEffect(() => {
    const timer = window.setTimeout(() => {
      uiStore.setState((state) => ({ notices: state.notices.filter((entry) => entry.seq !== notice.seq) }))
    }, duration)
    return () => window.clearTimeout(timer)
  }, [notice.seq, duration])

  const { label, title, body, speaker } = describe(notice)
  return (
    <li className="animate-[echo-rise_0.6s_ease-out_both] rounded-lg border border-border bg-background/65 px-3.5 py-2.5 backdrop-blur-md motion-reduce:animate-none">
      <p className="text-[0.6rem] uppercase tracking-[0.3em] text-accent">{label}</p>
      {title && <p className="mt-1 font-display text-[0.7rem] leading-snug tracking-[0.1em] text-foreground">{title}</p>}
      {body && (
        <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-foreground/80 sm:line-clamp-none">{body}</p>
      )}
      {speaker && <p className="mt-1.5 text-[0.68rem] italic text-muted-foreground">{`— ${speaker}`}</p>}
    </li>
  )
}

function describe(notice: Notice): { label: string; title?: string; body?: string; speaker?: string } {
  switch (notice.kind) {
    case 'fragment': {
      const fragment = FRAGMENTS[notice.id]
      return { label: NOTICE_TEXT.fragment, title: fragment.title, body: fragment.text, speaker: fragment.speaker }
    }
    case 'secret': {
      const secret = SECRETS[notice.id]
      return { label: NOTICE_TEXT.secret, title: secret.name, body: secret.text }
    }
    case 'item': {
      const item = ITEMS[notice.id]
      return { label: NOTICE_TEXT.item, title: item.name, body: item.text }
    }
    case 'solved': {
      const puzzle = PUZZLES[notice.id]
      return { label: NOTICE_TEXT.solved, title: puzzle.name, body: puzzle.solved }
    }
    case 'info':
      return { label: NOTICE_TEXT.info, body: notice.message }
  }
}
