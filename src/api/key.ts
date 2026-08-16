/**
 * Her Claude API key. The ONLY place the secret is read or written (D5).
 *
 * Non-negotiables that follow from that decision:
 *
 *   - It lives in browser local storage, typed into Settings. Never in the repo, never in
 *     a `.env`, never in a build output, never in a commit message.
 *   - It is NOT in the `settings` Dexie table, and that is deliberate: `db/backup.ts`
 *     exports Dexie, so a key kept there could ride along in a backup she emails herself.
 *     Local storage cannot end up in an export by accident.
 *   - Nothing logs it. Not on an error, not in a report.
 *
 * `git grep -n "sk-ant"` must return nothing, ever.
 */

import { readPref, writePref } from '../platform/prefs'

const KEY = 'apiKey'

export function getApiKey(): string {
  const stored = readPref<string>(KEY, '')
  return typeof stored === 'string' ? stored.trim() : ''
}

export function setApiKey(key: string): void {
  writePref(KEY, key.trim())
}

export function clearApiKey(): void {
  writePref(KEY, '')
}

/**
 * Enough of a key to spend, not a validation. A real check is a request that comes back
 * 401, and the error copy for that already exists — guessing at the format here would only
 * reject a key shape that changes later.
 */
export function hasApiKey(): boolean {
  return getApiKey().length > 8
}

/** "sk-ant-…4f2a" — for showing that a key is present without printing it. */
export function maskApiKey(key = getApiKey()): string {
  if (!key) return ''
  return key.length <= 12 ? '••••' : `${key.slice(0, 7)}…${key.slice(-4)}`
}
