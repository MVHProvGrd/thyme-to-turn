/**
 * The clock, behind a seam. Everything that stamps `createdAt`/`updatedAt` calls this
 * rather than `new Date()` directly, so a test can pin time and assert on it instead of
 * asserting "some string that looks ISO-ish".
 */

let override: (() => string) | null = null

export function now(): string {
  return override ? override() : new Date().toISOString()
}

/** Tests only. Returns the restore function. */
export function setClock(fn: (() => string) | null): () => void {
  const previous = override
  override = fn
  return () => {
    override = previous
  }
}

export function today(): string {
  return now().slice(0, 10)
}
