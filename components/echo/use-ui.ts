'use client'

import { useSyncExternalStore } from 'react'
import { uiStore, type UIState } from '@/game/ui/store'

/** Subscribe to one slice of engine UI state. Selectors must return primitives or stored references. */
export function useUI<T>(selector: (state: UIState) => T): T {
  return useSyncExternalStore(
    uiStore.subscribe,
    () => selector(uiStore.getState()),
    () => selector(uiStore.getInitialState()),
  )
}
