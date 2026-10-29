'use client'

import { useEffect, useRef, useState } from 'react'
import type { Game } from '@/game/core/Game'
import { uiStore } from '@/game/ui/store'
import { BootOverlay } from './boot-overlay'
import { GameContext } from './game-context'
import { Hud } from './hud'
import { PauseMenu } from './pause-menu'

function describeStartupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/webgl/i.test(message)) {
    return 'ECHO needs WebGL 2, which this browser or device did not provide. Try a recent Chrome, Edge, Firefox or Safari with hardware acceleration enabled.'
  }
  return 'The world failed to wake. Reload the page to try again.'
}

/** Mounts the engine client-side only; three.js is code-split and loaded on demand. */
export function EchoGame() {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    let cancelled = false
    let instance: Game | null = null

    import('@/game/core/Game')
      .then(({ Game }) => {
        if (cancelled) return
        instance = new Game(viewport)
        instance.start()
        setGame(instance)
      })
      .catch((error: unknown) => {
        console.error('[echo] engine failed to start', error)
        uiStore.setState({ fatalError: describeStartupError(error) })
      })

    return () => {
      cancelled = true
      instance?.dispose()
      instance = null
      setGame(null)
    }
  }, [])

  return (
    <GameContext.Provider value={game}>
      <main className="fixed inset-0 touch-none overflow-hidden bg-background text-foreground select-none">
        <h1 className="sr-only">ECHO — The World Remembers Everything</h1>
        <div
          ref={viewportRef}
          className="absolute inset-0"
          role="application"
          aria-label="ECHO game view. Click to capture the mouse, then use W A S D to move."
        />
        <Hud />
        <PauseMenu />
        <BootOverlay />
      </main>
    </GameContext.Provider>
  )
}
