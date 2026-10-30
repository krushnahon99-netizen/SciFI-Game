'use client'

import { useUI } from './use-ui'

const RADIUS = 21
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Echo pulse charge ring: fills during the cooldown and glows when the next pulse is ready. */
export function PulseIndicator() {
  const charge = useUI((state) => state.pulseCharge)
  const ready = charge >= 1

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg
        viewBox="0 0 48 48"
        className={`size-11 -rotate-90 transition-[filter] duration-300 ${ready ? 'drop-shadow-[0_0_6px_var(--color-primary)]' : ''}`}
        role="img"
        aria-label={ready ? 'Echo pulse ready' : 'Echo pulse charging'}
      >
        <circle cx="24" cy="24" r={RADIUS} fill="rgb(0 0 0 / 0.28)" className="stroke-foreground/20" strokeWidth="1.5" />
        <circle
          cx="24"
          cy="24"
          r={RADIUS}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - charge)}
          className={`stroke-primary transition-[stroke-dashoffset,opacity] duration-150 ease-linear ${ready ? 'opacity-100' : 'opacity-60'}`}
        />
        <circle
          cx="24"
          cy="24"
          r={ready ? 5.5 : 3.5}
          className={`fill-primary transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-40'}`}
        />
      </svg>
      <span className="font-display text-[0.55rem] uppercase tracking-[0.3em] text-foreground/75 [text-shadow:0_1px_6px_rgb(0_0_0/0.6)]">
        Q · Echo
      </span>
    </div>
  )
}
