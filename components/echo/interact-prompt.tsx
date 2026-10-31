'use client'

import { useUI } from './use-ui'

/** "E · Attune pillar": shown while the explorer is within reach of something usable (lane A sets the text). */
export function InteractPrompt() {
  const prompt = useUI((state) => state.interactPrompt)

  return (
    <div role="status" className="flex justify-center">
      {prompt && (
        <p className="flex animate-[echo-rise_0.35s_ease-out_both] items-center gap-2.5 rounded-full border border-primary/45 bg-background/60 py-1 pl-1 pr-4 backdrop-blur-md motion-reduce:animate-none">
          <kbd className="grid size-6 place-items-center rounded-full border border-primary/70 bg-primary/15 font-display text-[0.6rem] text-primary">
            E
          </kbd>
          <span className="text-[0.7rem] uppercase tracking-[0.22em] text-foreground/90">{prompt}</span>
        </p>
      )}
    </div>
  )
}
