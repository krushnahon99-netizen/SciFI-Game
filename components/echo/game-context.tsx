'use client'

import { createContext, useContext } from 'react'
import type { Game } from '@/game/core/Game'

export const GameContext = createContext<Game | null>(null)

/** The running engine instance, or null while it loads. */
export function useGame(): Game | null {
  return useContext(GameContext)
}
