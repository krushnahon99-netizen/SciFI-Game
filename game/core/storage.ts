/** localStorage with an in-memory fallback (private mode, disabled storage, sandboxed iframes). */
const memory = new Map<string, string>()
let localAvailable: boolean | null = null

function canUseLocalStorage(): boolean {
  if (localAvailable !== null) return localAvailable
  try {
    const probe = '__echo_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    localAvailable = true
  } catch {
    localAvailable = false
  }
  return localAvailable
}

export const storage = {
  /** False when progress only lives for this tab session. */
  get persistent(): boolean {
    return canUseLocalStorage()
  },

  get<T>(key: string, fallback: T): T {
    try {
      const raw = canUseLocalStorage() ? window.localStorage.getItem(key) : (memory.get(key) ?? null)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },

  set(key: string, value: unknown) {
    const raw = JSON.stringify(value)
    try {
      if (canUseLocalStorage()) {
        window.localStorage.setItem(key, raw)
        return
      }
    } catch {
      // Quota exceeded or storage revoked mid-session: keep the value in memory instead.
    }
    memory.set(key, raw)
  },

  remove(key: string) {
    memory.delete(key)
    try {
      if (canUseLocalStorage()) window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
}
