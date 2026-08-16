/**
 * The backup file's shape, and the merge rules for reading one back in.
 *
 * PURE, deliberately: the upsert-by-uuid logic is the single most dangerous code in the
 * app — get it wrong and re-importing a file silently doubles her collection — so it is
 * plain functions over arrays, testable to death without a database. `db/backup.ts` does
 * nothing but move rows between Dexie and these functions.
 *
 * > The coin tracker's playbook records the alternative, in its own words:
 * > "BackupManager.importJson is *additive* (don't re-import the same file — it
 * > duplicates)." We have uuids specifically so we don't have to live with that.
 */

import type { Book, IngredientEntry, Recipe, Settings } from './types'

/** Bumped only when the *file* shape changes, which is not the same as the Dexie version. */
export const BACKUP_FORMAT = 'thyme-to-turn-backup'

export type BackupManifest = {
  app: typeof BACKUP_FORMAT
  schemaVersion: number
  exportedAt: string
  counts: { recipes: number; books: number; ingredients: number; photos: number }
}

/**
 * Phase 1 exports a single JSON file — there are no photos yet, and one file she can
 * email herself beats a zip she has to unpack. Phase 4 wraps this exact object as
 * `manifest.json` + `recipes.json` + `photos/<uuid>.jpg` inside a zip; the `photos` count
 * is already in the manifest so the reader can tell the two apart.
 */
export type Backup = {
  manifest: BackupManifest
  recipes: Recipe[]
  books: Book[]
  ingredients: IngredientEntry[]
  /** Never carries the API key. A secret must not be able to ride along in a backup. */
  settings: Omit<Settings, 'key'> & { key: 'singleton' }
}

export type BackupInput = {
  schemaVersion: number
  exportedAt: string
  recipes: Recipe[]
  books: Book[]
  ingredients: IngredientEntry[]
  settings: Settings
  photoCount?: number
}

export function buildBackup(input: BackupInput): Backup {
  return {
    manifest: {
      app: BACKUP_FORMAT,
      schemaVersion: input.schemaVersion,
      exportedAt: input.exportedAt,
      counts: {
        recipes: input.recipes.length,
        books: input.books.length,
        ingredients: input.ingredients.length,
        photos: input.photoCount ?? 0,
      },
    },
    recipes: input.recipes,
    books: input.books,
    ingredients: input.ingredients,
    settings: input.settings,
  }
}

export class BackupError extends Error {}

/**
 * Rule 1 of the import order: read the manifest, and refuse a file from a *newer* schema
 * than we know how to read. A clear "this backup is from a newer version of the app"
 * beats a silent half-import every time.
 */
export function readBackup(text: string, ourSchemaVersion: number): Backup {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't a Thyme to Turn backup — it isn't JSON.")
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new BackupError("That file isn't a Thyme to Turn backup.")
  }
  const candidate = parsed as Partial<Backup>
  const manifest = candidate.manifest
  if (!manifest || manifest.app !== BACKUP_FORMAT) {
    throw new BackupError("That file isn't a Thyme to Turn backup.")
  }
  if (typeof manifest.schemaVersion !== 'number') {
    throw new BackupError('That backup is missing its version. It may be damaged.')
  }
  if (manifest.schemaVersion > ourSchemaVersion) {
    throw new BackupError(
      `That backup is from a newer version of the app (v${manifest.schemaVersion}). Update the app first — importing it now would lose data.`,
    )
  }
  if (!Array.isArray(candidate.recipes)) {
    throw new BackupError('That backup has no recipes in it.')
  }

  return {
    manifest,
    recipes: candidate.recipes,
    books: Array.isArray(candidate.books) ? candidate.books : [],
    ingredients: Array.isArray(candidate.ingredients) ? candidate.ingredients : [],
    settings: candidate.settings ?? { key: 'singleton', schemaVersion: manifest.schemaVersion, pantry: [] },
  }
}

export type MergeReport = {
  added: number
  updated: number
  unchanged: number
}

export type MergeResult<T> = {
  rows: T[]
  report: MergeReport
}

/**
 * Upsert by uuid. Existing row wins if its `updatedAt` is newer; incoming row wins if
 * *its* is. Never blind-append.
 *
 * The test that matters isn't "does a fresh import restore everything" — it's "does
 * importing the SAME file twice change nothing the second time."
 */
export function mergeByUuid<T extends { uuid: string; updatedAt?: string }>(
  existing: T[],
  incoming: T[],
): MergeResult<T> {
  const byUuid = new Map<string, T>()
  for (const row of existing) byUuid.set(row.uuid, row)

  const report: MergeReport = { added: 0, updated: 0, unchanged: 0 }

  for (const row of incoming) {
    if (!row || typeof row.uuid !== 'string' || !row.uuid) continue
    const current = byUuid.get(row.uuid)
    if (!current) {
      byUuid.set(row.uuid, row)
      report.added += 1
      continue
    }
    // No timestamps to compare → keep what's already on the device. Her edits win over
    // a backup that can't prove it's newer.
    const mine = current.updatedAt ?? ''
    const theirs = row.updatedAt ?? ''
    if (theirs > mine) {
      byUuid.set(row.uuid, row)
      report.updated += 1
    } else {
      report.unchanged += 1
    }
  }

  return { rows: [...byUuid.values()], report }
}

/** "42 recipes: 3 new, 39 already present." — rule 4, report what happened. */
export function describeMerge(label: string, report: MergeReport): string {
  const total = report.added + report.updated + report.unchanged
  const parts = [`${report.added} new`]
  if (report.updated) parts.push(`${report.updated} updated`)
  parts.push(`${report.unchanged} already present`)
  return `${total} ${label}: ${parts.join(', ')}.`
}

export function backupFilename(isoDate: string): string {
  return `thyme-to-turn-backup-${isoDate.slice(0, 10)}.json`
}
