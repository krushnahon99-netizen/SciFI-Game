// Shared vocabulary for both lanes (docs/coordination.md §4). Change only through a Request there.

export type RegionId = 'cradle' | 'hall' | 'vale' | 'chasm' | 'works' | 'undervault' | 'spire'
export type PuzzleId = 'choir' | 'glass-bridge' | 'dormant-grid'
export type SecretId = 'ghost-garden' | 'sleeping-giant' | 'drowned-bell'
export type ItemId = 'heart-key'
export type FragmentId = 'f01' | 'f02' | 'f03' | 'f04' | 'f05' | 'f06' | 'f07' | 'f08' | 'f09' | 'f10'
export type Surface = 'stone' | 'sand' | 'crystal' | 'metal' | 'glass'

/**
 * Read-only saved progress, implemented by progression.ts (lane B). World builders (lane A) read it on load
 * to restore state: open solved gates, keep the bridge stabilised, hide fragments already found.
 */
export interface ProgressView {
  isSolved(id: PuzzleId): boolean
  has(id: FragmentId | SecretId | ItemId): boolean
  visited(id: RegionId): boolean
  /** Region of the last `regionEnter`: where a loaded game (and a respawn) puts the player. */
  readonly checkpoint: RegionId
  /** The ending was reached at least once; the world may stay "remembered" during free roam. */
  readonly completed: boolean
  /** The Heart Key was set into the Listening Spire's gate: the barrier stays open. */
  readonly spireOpen: boolean
}

/** Stand-in until progression.ts exists: nothing solved, nothing found. */
export const EMPTY_PROGRESS: ProgressView = {
  isSolved: () => false,
  has: () => false,
  visited: () => false,
  checkpoint: 'cradle',
  completed: false,
  spireOpen: false,
}
