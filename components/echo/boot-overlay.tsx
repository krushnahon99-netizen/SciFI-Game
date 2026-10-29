'use client'

import { cn } from '@/lib/utils'
import { useUI } from './use-ui'

/** Covers the screen while three.js loads and shaders compile; also shows fatal startup errors. */
export function BootOverlay() {
  const booted = useUI((state) => state.booted)
  const fatalError = useUI((state) => state.fatalError)
  const visible = !booted || fatalError !== null

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background px-6 text-center transition-opacity duration-1000',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <p className="font-display text-5xl tracking-[0.5em] pl-[0.5em] text-foreground sm:text-7xl">ECHO</p>
      <p className="font-display text-[0.6rem] tracking-[0.45em] pl-[0.45em] text-muted-foreground sm:text-xs">
        THE WORLD REMEMBERS EVERYTHING
      </p>
      {fatalError ? (
        <p role="alert" className="mt-6 max-w-md text-sm leading-relaxed text-destructive">
          {fatalError}
        </p>
      ) : (
        <p role="status" className="mt-6 animate-pulse text-[0.65rem] uppercase tracking-[0.35em] text-primary">
          Waking the world
        </p>
      )}
    </div>
  )
}
