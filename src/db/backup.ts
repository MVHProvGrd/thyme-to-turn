/**
 * Export and import. Built in phase 1, before anything else touches her data, because a
 * backup you add later is a backup you don't have for the migration that needed it.
 *
 * All of the dangerous thinking lives in lib/backup-format.ts as pure functions; this
 * file only moves rows between Dexie and those functions.
 */

import { db } from './db'
import { SCHEMA_VERSION } from './schema'
import { getSettings } from './repo'
import { backupFilename, buildBackup, describeMerge, mergeByUuid, readBackup } from '../lib/backup-format'
import { now } from '../platform/clock'
import type { Backup } from '../lib/backup-format'
import type { Book, IngredientEntry, Recipe } from '../lib/types'

export type ExportedBackup = { filename: string; text: string; backup: Backup }

export async function exportBackup(): Promise<ExportedBackup> {
  const exportedAt = now()
  const [recipes, books, ingredients, settings, photoCount] = await Promise.all([
    db.recipes.toArray(),
    db.books.toArray(),
    db.ingredients.toArray(),
    getSettings(),
    db.photos.count(),
  ])

  const backup = buildBackup({
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    recipes,
    books,
    ingredients,
    settings,
    photoCount,
  })

  return { filename: backupFilename(exportedAt), text: JSON.stringify(backup, null, 2), backup }
}

export type ImportReport = { lines: string[]; recipeCount: number }

/**
 * Upsert by uuid, never blind-append. Importing the same file twice must leave the
 * collection exactly as it was — that is the property the round-trip test exists to prove.
 */
export async function importBackup(text: string): Promise<ImportReport> {
  const incoming = readBackup(text, SCHEMA_VERSION)

  const [recipes, books, ingredients] = await Promise.all([
    db.recipes.toArray() as Promise<Recipe[]>,
    db.books.toArray() as Promise<Book[]>,
    db.ingredients.toArray() as Promise<IngredientEntry[]>,
  ])

  const mergedRecipes = mergeByUuid(recipes, incoming.recipes)
  const mergedBooks = mergeByUuid(books, incoming.books)
  // Registry entries carry no updatedAt, so a name already on the device always wins —
  // her corrections are not overwritten by an older backup's spelling.
  const mergedIngredients = mergeByUuid(ingredients, incoming.ingredients)

  await db.transaction('rw', db.recipes, db.books, db.ingredients, async () => {
    await db.recipes.bulkPut(mergedRecipes.rows)
    await db.books.bulkPut(mergedBooks.rows)
    await db.ingredients.bulkPut(mergedIngredients.rows)
  })

  // seenCount is derived, and the merge may have changed which recipes exist.
  for (const entry of await db.ingredients.toArray()) {
    const seenCount = await db.recipes.where('ingredientIndex').equals(entry.uuid).count()
    if (entry.seenCount !== seenCount) await db.ingredients.put({ ...entry, seenCount })
  }

  const lines = [describeMerge('recipes', mergedRecipes.report)]
  if (incoming.books.length) lines.push(describeMerge('books', mergedBooks.report))

  return { lines, recipeCount: mergedRecipes.rows.length }
}
