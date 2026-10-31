'use client'

import { useSyncExternalStore } from 'react'

const COARSE_POINTER = '(pointer: coarse)'

// Shared by every subscriber: phones and tablets match the media query; a touch-screen laptop switches to the
// on-screen controls the first time a finger touches the page.
let touchSeen = false
let media: MediaQueryList | null = null
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((listener) => listener())
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'touch' || touchSeen) return
  touchSeen = true
  notify()
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    media = window.matchMedia(COARSE_POINTER)
    media.addEventListener('change', notify)
    window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true })
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size > 0) return
    media?.removeEventListener('change', notify)
    media = null
    window.removeEventListener('pointerdown', onPointerDown, { capture: true })
  }
}

function getSnapshot(): boolean {
  return touchSeen || (media ?? window.matchMedia(COARSE_POINTER)).matches
}

/** True when the on-screen touch controls should replace the keyboard/mouse hints. */
export function useTouchMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
