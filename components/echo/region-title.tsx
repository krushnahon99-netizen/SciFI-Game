'use client'

import { useEffect, useRef } from 'react'
import { REGIONS } from '@/game/gameplay/content'
import { useUI } from './use-ui'

const SHOW_MS = 5200

/** Region name card: fades in when the player enters a region (`uiStore.region`), holds, then fades out. */
export function RegionTitle() {
  const region = useUI((state) => state.region)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const card = cardRef.current
    if (!region || !card) return
    const timing: KeyframeAnimationOptions = { duration: SHOW_MS, easing: 'ease-out', fill: 'both' }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const fade = card.animate(
        [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }],
        timing,
      )
      return () => fade.cancel()
    }
    const animations = [
      card.animate(
        [
          { opacity: 0, transform: 'translateY(8px)', filter: 'blur(6px)' },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)', offset: 0.14 },
          { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)', offset: 0.82 },
          { opacity: 0, transform: 'translateY(-4px)', filter: 'blur(3px)' },
        ],
        timing,
      ),
      ...Array.from(card.querySelectorAll<HTMLElement>('[data-rule]'), (line) =>
        line.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)', offset: 0.3 }, { transform: 'scaleX(1)' }], timing),
      ),
    ]
    return () => animations.forEach((animation) => animation.cancel())
  }, [region])

  const text = region ? REGIONS[region] : null

  return (
    <div role="status" className="absolute inset-x-0 top-[max(14vh,3.5rem)] flex justify-center px-6">
      {text && (
        <div ref={cardRef} className="flex flex-col items-center gap-3 text-center opacity-0">
          <div aria-hidden="true" className="flex items-center gap-2.5">
            <span data-rule className="h-px w-12 origin-right bg-linear-to-r from-transparent to-primary sm:w-20" />
            <span className="size-1.5 rotate-45 border border-primary bg-primary/30" />
            <span data-rule className="h-px w-12 origin-left bg-linear-to-l from-transparent to-primary sm:w-20" />
          </div>
          <p className="text-balance pl-[0.22em] font-display text-base uppercase tracking-[0.22em] text-foreground [text-shadow:0_2px_16px_rgb(0_0_0/0.7)] sm:pl-[0.32em] sm:text-2xl sm:tracking-[0.32em] lg:text-3xl">
            {text.name}
          </p>
          <p className="text-balance text-xs tracking-[0.18em] text-foreground/75 [text-shadow:0_1px_10px_rgb(0_0_0/0.75)] sm:text-sm">
            {text.subtitle}
          </p>
        </div>
      )}
    </div>
  )
}
