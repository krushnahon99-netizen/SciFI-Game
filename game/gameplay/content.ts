// Every player-facing string (lane B). Lane A reads region names, interaction prompts and fragment flags from here
// instead of hard-coding text (docs/coordination.md §6). Plain data: no three, no React.
import type { FragmentId, ItemId, PuzzleId, RegionId, SecretId } from './ids'

export const GAME_TITLE = 'ECHO'
export const TAGLINE = 'The world remembers everything.'

export interface RegionText {
  name: string
  /** One line under the region title card. */
  subtitle: string
  /** Journal "Places" entry. */
  journal: string
}

export const REGIONS: Record<RegionId, RegionText> = {
  cradle: {
    name: 'The Cradle',
    subtitle: 'Where the first word was spoken',
    journal: 'A basin of ancient stone around the Sundered Monolith. You woke here.',
  },
  hall: {
    name: 'Hall of Echoes',
    subtitle: 'Four voices, one order',
    journal: 'A ruined temple in the ridge pass. Its sanctum still keeps the choir’s song.',
  },
  vale: {
    name: 'The Singing Vale',
    subtitle: 'Voices grown into crystal',
    journal: 'A valley of resonant crystal that hums whenever the wind moves through it.',
  },
  chasm: {
    name: 'The Glass Bridge',
    subtitle: 'A road made of memory',
    journal: 'A chasm crossed by a bridge that is only there while someone remembers it.',
  },
  works: {
    name: 'Conduit Works',
    subtitle: 'Where song became light',
    journal: 'An abandoned facility that once turned song into power for the cities.',
  },
  undervault: {
    name: 'The Undervault',
    subtitle: 'What was hidden from the song',
    journal: 'A sunken chamber, sealed away from the reach of the choir.',
  },
  spire: {
    name: 'The Listening Spire',
    subtitle: 'Someone must hear them',
    journal: 'The summit where the last song waits for a listener.',
  },
}

export interface FragmentText {
  region: RegionId
  title: string
  /** Whose memory this is; shown as the attribution line. */
  speaker: string
  text: string
  /** Only visible (and collectable) while revealed by an echo pulse. */
  pulseOnly: boolean
}

export const FRAGMENTS: Record<FragmentId, FragmentText> = {
  f01: {
    region: 'cradle',
    title: 'The First Word',
    speaker: 'Keeper of the Cradle',
    text: 'Before the cities, before the songs, there was only the Monolith, and the Monolith listened. Our first word was spoken to it, and it never forgot a single word after. We named this place the Cradle, because everything we were began here.',
    pulseOnly: false,
  },
  f02: {
    region: 'cradle',
    title: 'The Sundering',
    speaker: 'A pilgrim',
    text: 'When the sun began to fade, the elders struck the Monolith to wake its deepest memory. It split in two, and for one whole night every voice it had ever heard spoke at once. Some called it a miracle. Most of us only covered our ears.',
    pulseOnly: true,
  },
  f03: {
    region: 'hall',
    title: 'Four Voices',
    speaker: 'Warden of the Hall',
    text: 'Four pillars, four voices. The Hall keeps our songs in their proper order, the way the stone prefers. Sing out of turn and the north doors will not move. The stone has always cared more about order than we did.',
    pulseOnly: false,
  },
  f04: {
    region: 'hall',
    title: 'Rehearsal',
    speaker: 'A singer of the second voice',
    text: 'We rehearsed the Great Song here for a hundred years, and no one alive ever heard the whole of it. Each of us learned only our own part. We trusted the stone to remember the rest.',
    pulseOnly: true,
  },
  f05: {
    region: 'vale',
    title: 'Seeds of Song',
    speaker: 'A grower of the Vale',
    text: 'The crystals of the Vale are our voices, grown solid. Every song sung here left a seed in the ground, and the old ones still hum when the wind is right. Walk softly. Some of them are listening back.',
    pulseOnly: false,
  },
  f06: {
    region: 'vale',
    title: 'The Last Harvest',
    speaker: 'A child',
    text: 'We stopped cutting the crystals when Mother said they could hear us. After that we only came to listen. If you hum to the tall ones they hum back, but only if you mean it.',
    pulseOnly: true,
  },
  f07: {
    region: 'chasm',
    title: 'The Glass Road',
    speaker: 'The bridgekeeper',
    text: 'The bridge was never made of glass. It was made of agreement: as long as enough of us remembered it, it held. There are fewer of us every season. Cross quickly, while someone still remembers.',
    pulseOnly: true,
  },
  f08: {
    region: 'works',
    title: 'Three Hearts',
    speaker: 'A conduit engineer',
    text: 'The Works turned song into light. When the sun failed we drove the conduits until they burned, and still it was not enough. The grid has three hearts. Wake them together, or they fall back to sleep.',
    pulseOnly: false,
  },
  f09: {
    region: 'undervault',
    title: 'The Dissenter',
    speaker: 'The last Keeper',
    text: 'A song with no one left to hear it is only noise. So I took the Heart from the Spire and hid it here, below the reach of the choir. Whoever finds it will not be one of us. Let them decide whether we are worth remembering.',
    pulseOnly: true,
  },
  f10: {
    region: 'spire',
    title: 'The Listener',
    speaker: 'The last Cantor',
    text: 'The Spire was never built to sing. It was built to listen. When the last voice falls silent, someone must stand at the summit and hear all of us at once. Only then will we have been real.',
    pulseOnly: false,
  },
}

export interface SecretText {
  name: string
  text: string
}

export const SECRETS: Record<SecretId, SecretText> = {
  'ghost-garden': {
    name: 'The Ghost Garden',
    text: 'Stepping stones that exist only while remembered, leading to a garden someone tended between two moments. Nothing grows there now except the memory of it.',
  },
  'sleeping-giant': {
    name: 'The Sleeping Giant',
    text: 'A colossal figure lies buried in the sand, its face turned toward the ringed planet. Its makers never finished it. Perhaps it was meant to wake when the song was sung.',
  },
  'drowned-bell': {
    name: 'The Drowned Bell',
    text: 'A great bell rests at the bottom of a crater that was once a lake. It last rang on the day the sun first dimmed, and the stone still remembers the sound.',
  },
}

export interface ItemText {
  name: string
  text: string
}

export const ITEMS: Record<ItemId, ItemText> = {
  'heart-key': {
    name: 'The Heart Key',
    text: 'A resonant core, warm to the touch. It hums in the same key as the Listening Spire.',
  },
}

export interface PuzzleText {
  name: string
  region: RegionId
  /** Shown when the puzzle is solved. */
  solved: string
  /** Journal hints, unlocked one by one as the player fails steps (see progression `fails`). */
  hints: readonly string[]
}

export const PUZZLES: Record<PuzzleId, PuzzleText> = {
  choir: {
    name: 'The Choir Sequence',
    region: 'hall',
    solved: 'The Hall remembers its song. The north gate opens.',
    hints: [
      'The altar remembers the choir. Send a pulse beside it.',
      'Watch which pillar each singer turns to, and in what order.',
      'A wrong note silences the pillars. Begin again from the first voice.',
    ],
  },
  'glass-bridge': {
    name: 'The Glass Bridge',
    region: 'chasm',
    solved: 'The bridge holds. It will not forget again.',
    hints: [
      'Some paths exist only while they are remembered.',
      'Pulse at the edge of the chasm and watch for the planks.',
      'A revealed plank fades after a few breaths. Pulse again as you cross.',
    ],
  },
  'dormant-grid': {
    name: 'The Dormant Grid',
    region: 'works',
    solved: 'Power floods the Works. The sealed door opens.',
    hints: [
      'Three nodes, too far apart for a single pulse.',
      'A charged node holds its light only briefly.',
      'Charge them one after another, quickly, so all three burn at once.',
    ],
  },
}

/** Ordered story beats; progression.ts derives the current one from saved state. */
export type ObjectiveId =
  | 'awaken'
  | 'find-hall'
  | 'choir'
  | 'cross-vale'
  | 'bridge'
  | 'grid'
  | 'heart-key'
  | 'spire'
  | 'free'

export interface ObjectiveText {
  title: string
  detail: string
}

export const OBJECTIVES: Record<ObjectiveId, ObjectiveText> = {
  awaken: {
    title: 'Send an Echo Pulse',
    detail: 'The resonator on your back is humming. Release it and see what the stone remembers.',
  },
  'find-hall': {
    title: 'Find the Hall of Echoes',
    detail: 'Old paths surface when you pulse. Follow them through the ridge pass.',
  },
  choir: {
    title: 'Restore the choir’s song',
    detail: 'Pulse at the altar, then attune the four pillars in the order the singers reveal.',
  },
  'cross-vale': {
    title: 'Cross the Singing Vale',
    detail: 'Beyond the crystal valley lies a chasm. Find the way across.',
  },
  bridge: {
    title: 'Cross the Glass Bridge',
    detail: 'The bridge exists only while remembered. Pulse, then cross before it fades.',
  },
  grid: {
    title: 'Wake the Dormant Grid',
    detail: 'Charge the three conduit nodes of the Works so they burn at the same time.',
  },
  'heart-key': {
    title: 'Recover the Heart Key',
    detail: 'Something was hidden below, beyond the choir’s reach. Find the Undervault.',
  },
  spire: {
    title: 'Climb the Listening Spire',
    detail: 'The barrier answers to the Heart Key. Pulse at the Listening Stone on the summit.',
  },
  free: {
    title: 'The world remembers',
    detail: 'Explore freely. Some secrets are still waiting to be found.',
  },
}

/** `uiStore.interactPrompt` texts (lane A sets the prompt; the key hint is added by the HUD). */
export const PROMPTS = {
  attunePillar: 'Attune pillar',
  recoverMemory: 'Recover memory',
  takeHeartKey: 'Take the Heart Key',
  placeHeartKey: 'Place the Heart Key',
  touchStone: 'Touch the Listening Stone',
  inspect: 'Inspect',
} as const

export const NOTICE_TEXT = {
  fragment: 'Memory recovered',
  secret: 'Secret discovered',
  item: 'Acquired',
  solved: 'Echo restored',
  info: 'Note',
  noStorage: 'Saving is unavailable in this browser. Progress lasts until the tab is closed.',
} as const

export const INTRO = {
  lines: [
    'The stone keeps every word that was ever spoken to it.',
    'Every footstep. Every song. Every ending.',
    'Long after the last voice fell silent, the world went on remembering.',
    'And then, in the Cradle, something new opened its eyes.',
  ],
  skip: 'Skip intro',
} as const

export const TITLE_SCREEN = {
  continue: 'Continue',
  begin: 'Begin',
  newJourney: 'New journey',
  settings: 'Settings',
  controls: 'Controls',
  confirmNew: 'Begin a new journey? Your saved progress will be erased.',
  confirm: 'Erase and begin',
  cancel: 'Keep my progress',
  headphones: 'Best with headphones',
} as const

export const PAUSE = {
  title: 'Paused',
  resume: 'Resume',
  journal: 'Journal',
  settings: 'Settings',
  controls: 'Controls',
  toTitle: 'Return to title',
} as const

export const JOURNAL = {
  title: 'Journal',
  memories: 'Memories',
  places: 'Places',
  secrets: 'Secrets',
  objective: 'Current objective',
  hints: 'What the stone suggests',
  unknownMemory: 'A memory not yet recovered',
  unknownPlace: 'Not yet discovered',
  unknownSecret: 'Undiscovered secret',
} as const

export const SETTINGS_TEXT = {
  audio: 'Audio',
  volume: 'Master volume',
  mute: 'Mute',
  graphics: 'Graphics quality',
  renderScale: 'Render scale',
  auto: 'Auto',
} as const

export interface ControlText {
  action: string
  keys: string
}

export const CONTROLS: { keyboard: readonly ControlText[]; touch: readonly ControlText[] } = {
  keyboard: [
    { action: 'Move', keys: 'W A S D / Arrows' },
    { action: 'Run', keys: 'Shift' },
    { action: 'Jump', keys: 'Space' },
    { action: 'Look', keys: 'Mouse (click to capture)' },
    { action: 'Echo Pulse', keys: 'Q / Left click' },
    { action: 'Interact', keys: 'E' },
    { action: 'Journal', keys: 'J' },
    { action: 'Pause', keys: 'Esc' },
    { action: 'Mute', keys: 'M' },
    { action: 'Camera zoom', keys: 'Mouse wheel' },
    { action: 'Performance stats', keys: 'F3' },
  ],
  touch: [
    { action: 'Move', keys: 'Left joystick' },
    { action: 'Look', keys: 'Drag on the right side' },
    { action: 'Echo Pulse', keys: 'Pulse button' },
    { action: 'Jump', keys: 'Jump button' },
    { action: 'Interact', keys: 'Hand button, when shown' },
    { action: 'Pause and journal', keys: 'Menu button' },
  ],
}

export const ENDING = {
  title: 'The world remembers',
  lines: [
    'For one breath, every voice the stone had ever held sang at once, and someone was there to hear it.',
    'The singers are gone. Their memory is not.',
  ],
  stats: {
    time: 'Time',
    memories: 'Memories',
    secrets: 'Secrets',
    places: 'Places',
    pulses: 'Echo pulses',
  },
  keepExploring: 'Keep exploring',
  toTitle: 'Return to title',
} as const

export const REGION_IDS = Object.keys(REGIONS) as RegionId[]
export const FRAGMENT_IDS = Object.keys(FRAGMENTS) as FragmentId[]
export const SECRET_IDS = Object.keys(SECRETS) as SecretId[]
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
export const PUZZLE_IDS = Object.keys(PUZZLES) as PuzzleId[]
