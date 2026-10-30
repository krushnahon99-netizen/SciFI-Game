'use client'

import { VolumeX } from 'lucide-react'
import { SETTINGS_TEXT } from '@/game/gameplay/content'
import { useUI } from './use-ui'

/** Small HUD chip while the game is muted, so silence never looks like a bug. */
export function AudioIndicator() {
  const muted = useUI((state) => state.muted)
  if (!muted) return null
  return (
    <p
      role="status"
      className="flex items-center gap-1.5 rounded-full border border-border bg-background/55 px-2.5 py-1 text-[0.62rem] uppercase tracking-[0.22em] text-foreground/80 backdrop-blur-sm"
    >
      <VolumeX className="size-3.5" aria-hidden="true" />
      {SETTINGS_TEXT.muted}
      <span className="text-primary" aria-hidden="true">
        ·
      </span>
      <kbd className="font-sans">M</kbd>
    </p>
  )
}
