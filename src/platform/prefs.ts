/**
 * Small, disposable UI state that isn't hers to lose — which step of a recipe she's up to,
 * whether cook mode was on. Local storage, not IndexedDB: if it vanishes nothing of value
 * is gone, and it must never appear in an export.
 */

export function readPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`thyme:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`thyme:${key}`, JSON.stringify(value))
  } catch {
    // Private-mode Safari throws on write. Losing a checkmark is not worth a crash.
  }
}

/**
 * Tonight's marks on the dinner screen live here — sessionStorage, not localStorage.
 * "Don't have chicken" and "not chicken tonight" are indistinguishable, so these taps
 * are not facts about her kitchen: they survive opening a recipe and coming back, and a
 * mid-cooking reload, but they die with the tab. Never a standing pantry (D12).
 */
export function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(`thyme:${key}`)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(`thyme:${key}`, JSON.stringify(value))
  } catch {
    // Same as above: losing a tap is not worth a crash.
  }
}
