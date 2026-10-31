'use client'

import { Volume2, VolumeX } from 'lucide-react'
import type { ReactNode } from 'react'
import {
  CONTROLS,
  CONTROL_GROUPS,
  FRAGMENTS,
  FRAGMENT_IDS,
  JOURNAL,
  OBJECTIVES,
  PUZZLES,
  PUZZLE_IDS,
  REGIONS,
  REGION_IDS,
  SECRETS,
  SECRET_IDS,
  SETTINGS_TEXT,
  type ControlText,
} from '@/game/gameplay/content'
import { QUALITY_LEVELS, QUALITY_PRESETS } from '@/game/render/quality'
import { cn } from '@/lib/utils'
import { useGame } from './game-context'
import { useUI } from './use-ui'

const LEGEND = 'text-[0.68rem] uppercase tracking-[0.22em] text-muted-foreground'
const CHOICE = 'rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-ring'
const CHOICE_ON = 'border-primary/70 bg-primary/15 text-primary'
const CHOICE_OFF = 'border-border text-foreground/80 hover:border-foreground/30 hover:text-foreground'

/** Audio and graphics settings (pause menu and title screen). */
export function SettingsPanel() {
  const game = useGame()
  const quality = useUI((state) => state.quality)
  const auto = useUI((state) => state.qualityAuto)
  const renderScale = useUI((state) => state.renderScale)
  const volume = useUI((state) => state.volume)
  const muted = useUI((state) => state.muted)
  const volumePercent = Math.round(volume * 100)

  return (
    <div className="flex flex-col gap-5 pb-1">
      <fieldset>
        <legend className={LEGEND}>{SETTINGS_TEXT.audio}</legend>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={muted}
            aria-label={SETTINGS_TEXT.mute}
            onClick={() => game?.toggleMute()}
            className={cn(CHOICE, 'flex size-9 shrink-0 items-center justify-center', muted ? CHOICE_ON : CHOICE_OFF)}
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

      <fieldset>
        <legend className={LEGEND}>{SETTINGS_TEXT.graphics}</legend>
        <div role="radiogroup" aria-label={SETTINGS_TEXT.graphics} className="mt-2 grid grid-cols-5 gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={auto}
            title={SETTINGS_TEXT.autoNote}
            onClick={() => game?.setAutoQuality()}
            className={cn(CHOICE, 'px-2 py-2 text-xs', auto ? CHOICE_ON : CHOICE_OFF)}
          >
            {SETTINGS_TEXT.auto}
          </button>
          {QUALITY_LEVELS.map((level) => {
            const selected = !auto && quality === level
            return (
              <button
                key={level}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => game?.setQuality(level)}
                      className={cn(
                        CHOICE,
                        'px-2 py-2 text-xs',
                        selected ? CHOICE_ON : CHOICE_OFF,
                        auto && quality === level && 'border-dashed border-primary/60',
                      )}
                    >
                      {QUALITY_PRESETS[level].label}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label className="block">
        <span className={cn(LEGEND, 'flex items-baseline justify-between')}>
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
    </div>
  )
}

/** Keyboard and touch bindings. */
export function ControlsPanel() {
  return (
    <div className="flex flex-col gap-5 pb-1">
      <ControlGroup title={CONTROL_GROUPS.keyboard} rows={CONTROLS.keyboard} />
      <ControlGroup title={CONTROL_GROUPS.touch} rows={CONTROLS.touch} />
    </div>
  )
}

function ControlGroup({ title, rows }: { title: string; rows: readonly ControlText[] }) {
  return (
    <section>
      <h3 className={LEGEND}>{title}</h3>
      <dl className="mt-2 divide-y divide-border rounded-md border border-border">
        {rows.map(({ action, keys }) => (
          <div key={action} className="flex items-baseline justify-between gap-4 px-3 py-2">
            <dt className="text-sm text-foreground/85">{action}</dt>
            <dd className="text-right font-mono text-xs text-primary">{keys}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Objective, unlocked puzzle hints, then memories, places and secrets (found or still unknown). */
export function JournalPanel() {
  const progress = useUI((state) => state.progress)
  if (!progress) return null

  const objective = OBJECTIVES[progress.objective]
  const hints = PUZZLE_IDS.flatMap((id) => {
    const fails = progress.fails[id] ?? 0
    if (fails === 0 || progress.puzzles.includes(id)) return []
    return [{ id, name: PUZZLES[id].name, lines: PUZZLES[id].hints.slice(0, fails) }]
  })

  return (
    <div className="flex flex-col gap-6 pb-1">
      <section className="border-l-2 border-primary/70 pl-3">
        <h3 className={LEGEND}>{JOURNAL.objective}</h3>
        <p className="mt-1.5 font-display text-xs leading-snug tracking-[0.12em] text-foreground">{objective.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-pretty text-foreground/75">{objective.detail}</p>
      </section>

      {hints.length > 0 && (
        <JournalSection title={JOURNAL.hints}>
          {hints.map(({ id, name, lines }) => (
            <li key={id} className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2.5">
              <p className="font-display text-[0.68rem] tracking-[0.1em] text-accent">{name}</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-sm leading-relaxed text-foreground/80 marker:text-accent/70">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </JournalSection>
      )}

      <JournalSection title={JOURNAL.memories} found={progress.fragments.length} total={FRAGMENT_IDS.length}>
        {FRAGMENT_IDS.map((id) => {
          const fragment = FRAGMENTS[id]
          const found = progress.fragments.includes(id)
          return (
            <Entry
              key={id}
              found={found}
              title={found ? fragment.title : JOURNAL.unknownMemory}
              meta={progress.regions.includes(fragment.region) ? REGIONS[fragment.region].name : undefined}
              body={found ? fragment.text : undefined}
              attribution={found ? fragment.speaker : undefined}
            />
          )
        })}
      </JournalSection>

      <JournalSection title={JOURNAL.places} found={progress.regions.length} total={REGION_IDS.length}>
        {REGION_IDS.map((id) => {
          const visited = progress.regions.includes(id)
          return (
            <Entry
              key={id}
              found={visited}
              title={visited ? REGIONS[id].name : JOURNAL.unknownPlace}
              body={visited ? REGIONS[id].journal : undefined}
            />
          )
        })}
      </JournalSection>

      <JournalSection title={JOURNAL.secrets} found={progress.secrets.length} total={SECRET_IDS.length}>
        {SECRET_IDS.map((id) => {
          const found = progress.secrets.includes(id)
          return (
            <Entry
              key={id}
              found={found}
              title={found ? SECRETS[id].name : JOURNAL.unknownSecret}
              body={found ? SECRETS[id].text : undefined}
            />
          )
        })}
      </JournalSection>
    </div>
  )
}

function JournalSection({
  title,
  found,
  total,
  children,
}: {
  title: string
  found?: number
  total?: number
  children: ReactNode
}) {
  return (
    <section>
      <h3 className={cn(LEGEND, 'flex items-baseline justify-between gap-3')}>
        {title}
        {total !== undefined && (
          <span className="font-mono tracking-normal text-foreground/80">
            {found}
            <span aria-hidden="true">{`/${total}`}</span>
            <span className="sr-only">{` of ${total}`}</span>
          </span>
        )}
      </h3>
      <ul className="mt-2 flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Entry({
  found,
  title,
  meta,
  body,
  attribution,
}: {
  found: boolean
  title: string
  meta?: string
  body?: string
  attribution?: string
}) {
  return (
    <li className={cn('rounded-md border px-3 py-2.5', found ? 'border-border bg-background/35' : 'border-dashed border-border')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cn('text-sm', found ? 'font-medium text-foreground' : 'italic text-muted-foreground')}>{title}</p>
        {meta && <p className="shrink-0 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">{meta}</p>}
      </div>
      {body && <p className="mt-1 text-sm leading-relaxed text-pretty text-foreground/75">{body}</p>}
      {attribution && <p className="mt-1 text-xs italic text-muted-foreground">{`— ${attribution}`}</p>}
    </li>
  )
}
