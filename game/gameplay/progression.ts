// Progress flows one way (docs/coordination.md §4): lane A emits gameplay events, this records and saves them, and
// world builders read the ProgressView on load. The UI reads `uiStore.progress` / `uiStore.notices`.
import type { Emitter, GameEvents } from '../core/events'
import { storage } from '../core/storage'
import { uiStore } from '../ui/store'
import {
  FRAGMENT_IDS,
  ITEM_IDS,
  NOTICE_TEXT,
  PUZZLE_IDS,
  REGION_IDS,
  SECRET_IDS,
  type ObjectiveId,
} from './content'
import type { FragmentId, ItemId, ProgressView, PuzzleId, RegionId, SecretId } from './ids'

const SAVE_KEY = 'echo.save.v1'
const SAVE_VERSION = 1
/** Seconds of play between background saves; discoveries save immediately. */
const AUTOSAVE_SECONDS = 20
const MAX_NOTICES = 4

interface SaveData {
  version: typeof SAVE_VERSION
  checkpoint: RegionId
  regions: RegionId[]
  puzzles: PuzzleId[]
  fragments: FragmentId[]
  secrets: SecretId[]
  items: ItemId[]
  /** Wrong puzzle steps per puzzle; each one unlocks another journal hint. */
  fails: Partial<Record<PuzzleId, number>>
  completed: boolean
  /** Seconds spent in the 'playing' phase. */
  playTime: number
  pulses: number
  /** Epoch ms of the last write. */
  savedAt: number
}

/** What the objective, journal and end screen read from `uiStore.progress`. */
export interface ProgressSnapshot {
  readonly regions: readonly RegionId[]
  readonly puzzles: readonly PuzzleId[]
  readonly fragments: readonly FragmentId[]
  readonly secrets: readonly SecretId[]
  readonly items: readonly ItemId[]
  readonly fails: Readonly<Partial<Record<PuzzleId, number>>>
  readonly objective: ObjectiveId
  readonly checkpoint: RegionId
  readonly completed: boolean
  readonly pulses: number
  /** Refreshed on every save, not per frame. */
  readonly playTime: number
  /** False when saves only last for this tab (storage blocked). */
  readonly persistent: boolean
}

export type NoticeBody =
  | { kind: 'fragment'; id: FragmentId }
  | { kind: 'secret'; id: SecretId }
  | { kind: 'item'; id: ItemId }
  | { kind: 'solved'; id: PuzzleId }
  | { kind: 'info'; message: string }

export type Notice = NoticeBody & { readonly seq: number }

let noticeSeq = 0

export class Progression implements ProgressView {
  private readonly data: SaveData
  private readonly unsubscribe: Array<() => void>
  private sinceSave = 0
  private discarded = false
  private storageWarned = false

  /** True when there is a save worth continuing (drives the title screen's Continue). */
  static hasSave(): boolean {
    const data = sanitize(storage.get<unknown>(SAVE_KEY, null))
    return data.regions.length > 0 || data.playTime > 1
  }

  constructor(events: Emitter<GameEvents>) {
    this.data = sanitize(storage.get<unknown>(SAVE_KEY, null))
    this.unsubscribe = [
      events.on('regionEnter', ({ id }) => this.enterRegion(id)),
      events.on('puzzleStep', ({ id, ok }) => {
        if (!ok) this.fail(id)
      }),
      events.on('puzzleSolved', ({ id }) => {
        if (addUnique(this.data.puzzles, id)) this.record({ kind: 'solved', id })
      }),
      events.on('fragmentFound', ({ id }) => {
        if (addUnique(this.data.fragments, id)) this.record({ kind: 'fragment', id })
      }),
      events.on('secretFound', ({ id }) => {
        if (addUnique(this.data.secrets, id)) this.record({ kind: 'secret', id })
      }),
      events.on('itemFound', ({ id }) => {
        if (addUnique(this.data.items, id)) this.record({ kind: 'item', id })
      }),
      events.on('pulse', () => this.countPulse()),
      events.on('endingStart', () => {
        this.data.completed = true
        this.save()
      }),
      events.on('phase', ({ to }) => {
        if (to === 'paused' || to === 'ending') this.save()
        if (to === 'playing' && !this.storageWarned && !storage.persistent) {
          this.storageWarned = true
          this.notify({ kind: 'info', message: NOTICE_TEXT.noStorage })
        }
      }),
    ]
    window.addEventListener('pagehide', this.flush)
    document.addEventListener('visibilitychange', this.onVisibilityChange)
    this.publish()
  }

  // --- ProgressView ------------------------------------------------------------------------------

  get checkpoint(): RegionId {
    return this.data.checkpoint
  }

  get completed(): boolean {
    return this.data.completed
  }

  isSolved(id: PuzzleId): boolean {
    return this.data.puzzles.includes(id)
  }

  has(id: FragmentId | SecretId | ItemId): boolean {
    const { fragments, secrets, items } = this.data
    return (fragments as string[]).includes(id) || (secrets as string[]).includes(id) || (items as string[]).includes(id)
  }

  visited(id: RegionId): boolean {
    return this.data.regions.includes(id)
  }

  // --- Engine API --------------------------------------------------------------------------------

  get objective(): ObjectiveId {
    return objectiveFor(this.data)
  }

  get playTime(): number {
    return this.data.playTime
  }

  /** Call every frame while the phase is 'playing'. */
  update(dt: number) {
    this.data.playTime += dt
    this.sinceSave += dt
    if (this.sinceSave >= AUTOSAVE_SECONDS) this.save()
  }

  save() {
    if (this.discarded) return
    this.sinceSave = 0
    this.data.savedAt = Date.now()
    storage.set(SAVE_KEY, this.data)
    this.publish()
  }

  /** New journey: erase the save and stop writing, because the Game is about to be rebuilt. */
  discard() {
    this.discarded = true
    storage.remove(SAVE_KEY)
  }

  dispose() {
    this.save()
    for (const off of this.unsubscribe) off()
    window.removeEventListener('pagehide', this.flush)
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    uiStore.setState({ notices: [] })
  }

  // --- Internals ---------------------------------------------------------------------------------

  private readonly flush = () => this.save()

  private readonly onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') this.save()
  }

  private enterRegion(id: RegionId) {
    const isNew = addUnique(this.data.regions, id)
    if (!isNew && this.data.checkpoint === id) return
    this.data.checkpoint = id
    this.save()
  }

  private fail(id: PuzzleId) {
    this.data.fails[id] = (this.data.fails[id] ?? 0) + 1
    this.publish()
  }

  private countPulse() {
    this.data.pulses++
    // The first pulse completes the 'awaken' objective.
    if (this.data.pulses === 1) this.save()
  }

  private record(notice: NoticeBody) {
    this.save()
    this.notify(notice)
  }

  private notify(body: NoticeBody) {
    const notice = { ...body, seq: ++noticeSeq } as Notice
    uiStore.setState((state) => ({ notices: [...state.notices, notice].slice(-MAX_NOTICES) }))
  }

  private publish() {
    const data = this.data
    uiStore.setState({
      progress: {
        regions: [...data.regions],
        puzzles: [...data.puzzles],
        fragments: [...data.fragments],
        secrets: [...data.secrets],
        items: [...data.items],
        fails: { ...data.fails },
        objective: objectiveFor(data),
        checkpoint: data.checkpoint,
        completed: data.completed,
        pulses: data.pulses,
        playTime: data.playTime,
        persistent: storage.persistent,
      },
    })
  }
}

function objectiveFor(data: SaveData): ObjectiveId {
  if (data.completed) return 'free'
  if (data.pulses === 0) return 'awaken'
  if (!data.puzzles.includes('choir')) return data.regions.includes('hall') ? 'choir' : 'find-hall'
  if (!data.puzzles.includes('glass-bridge')) return data.regions.includes('chasm') ? 'bridge' : 'cross-vale'
  if (!data.puzzles.includes('dormant-grid')) return 'grid'
  if (!data.items.includes('heart-key')) return 'heart-key'
  return 'spire'
}

function emptySave(): SaveData {
  return {
    version: SAVE_VERSION,
    checkpoint: 'cradle',
    regions: [],
    puzzles: [],
    fragments: [],
    secrets: [],
    items: [],
    fails: {},
    completed: false,
    playTime: 0,
    pulses: 0,
    savedAt: 0,
  }
}

/** Keep only known IDs and sane numbers, so an old or hand-edited save can't break the world. */
function sanitize(raw: unknown): SaveData {
  const save = emptySave()
  if (!raw || typeof raw !== 'object') return save
  const source = raw as Record<string, unknown>
  if (source.version !== SAVE_VERSION) return save
  save.checkpoint = REGION_IDS.find((id) => id === source.checkpoint) ?? 'cradle'
  save.regions = known(source.regions, REGION_IDS)
  save.puzzles = known(source.puzzles, PUZZLE_IDS)
  save.fragments = known(source.fragments, FRAGMENT_IDS)
  save.secrets = known(source.secrets, SECRET_IDS)
  save.items = known(source.items, ITEM_IDS)
  const fails = source.fails && typeof source.fails === 'object' ? (source.fails as Record<string, unknown>) : {}
  for (const id of PUZZLE_IDS) {
    const count = Math.floor(positive(fails[id]))
    if (count > 0) save.fails[id] = count
  }
  save.completed = source.completed === true
  save.playTime = positive(source.playTime)
  save.pulses = Math.floor(positive(source.pulses))
  save.savedAt = positive(source.savedAt)
  return save
}

/** The valid IDs present in `value`, deduplicated and in canonical order. */
function known<T extends string>(value: unknown, valid: readonly T[]): T[] {
  return Array.isArray(value) ? valid.filter((id) => value.includes(id)) : []
}

function positive(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function addUnique<T>(list: T[], id: T): boolean {
  if (list.includes(id)) return false
  list.push(id)
  return true
}
