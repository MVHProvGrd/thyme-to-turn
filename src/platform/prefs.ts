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
