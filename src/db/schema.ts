/**
 * Dexie table definitions and the version() chain.
 *
 * The migration rules from 03-DATA-MODEL.md, which are not negotiable:
 *
 *   1. Never edit a shipped version(n) block. Add version(n+1).
 *   2. Additive only. New fields are optional; read them with `?? default`.
 *   3. Every upgrade() is idempotent and safe on a half-migrated database.
 *   4. Ship a migration alone — never combined with a feature.
 *   5. Tell her to export first, in plain words, before the merge.
 *
 * Dexie gotcha: version(n).stores({}) must repeat the FULL index definition for any table
 * it mentions. A partial stores() silently drops the indexes you left out.
 */

import Dexie from 'dexie'
import type { Table } from 'dexie'
import type { Book, IngredientEntry, PhotoBlob, Recipe, Settings } from '../lib/types'

/** Mirrored into every export; the importer refuses a file claiming a higher number. */
export const SCHEMA_VERSION = 1

export class ThymeDb extends Dexie {
  recipes!: Table<Recipe, string>
  books!: Table<Book, string>
  ingredients!: Table<IngredientEntry, string>
  photos!: Table<PhotoBlob, string>
  settings!: Table<Settings, string>

  constructor(name = 'thyme-to-turn') {
    super(name)

    // NOTE: `isStaple` is deliberately NOT indexed even though 03-DATA-MODEL.md lists it.
    // IndexedDB cannot use a boolean as a key, so Dexie silently leaves those rows out of
    // the index — a filter that appears to work and quietly returns nothing. The registry
    // is small enough to filter in memory; a phantom index is worse than none.
    this.version(1).stores({
      recipes: 'uuid, title, updatedAt, source.bookUuid, *tags, *ingredientIndex',
      books: 'uuid, title, externalRefs.isbn13, updatedAt',
      ingredients: 'uuid, canonical, *aliases',
      photos: 'uuid',
      settings: 'key',
    })
  }
}

export const SETTINGS_KEY = 'singleton'

export function defaultSettings(): Settings {
  return { key: SETTINGS_KEY, schemaVersion: SCHEMA_VERSION, pantry: [] }
}
