/**
 * ALL reads and writes. Screens call this; they never touch Dexie directly.
 *
 * One place to add a migration guard, one place to audit, one place where an
 * upsert-vs-append bug can live. It is also the only file that maintains the ingredient
 * registry and `recipe.ingredientIndex` — derived data with exactly one writer, which is
 * the only way derived data stays true.
 */

import { db } from './db'
import { SETTINGS_KEY, defaultSettings } from './schema'
import { newId } from '../lib/ids'
import { canonicalNames, normalize, parseIngredientLine, SEEDED_STAPLES } from '../lib/ingredients'
import { PRESET_CATEGORIES, addCategory, removeCategory } from '../lib/categories'
import { bookCitation } from '../lib/books'
import { normalizeIsbn } from '../lib/isbn'
import { now } from '../platform/clock'
import type {
  Book,
  Ingredient,
  IngredientEntry,
  IngredientGroup,
  PhotoBlob,
  PhotoRef,
  Recipe,
  RecipeSource,
  Settings,
  Step,
} from '../lib/types'

/** What the edit screen hands over. Everything derived is filled in here, not there. */
export type RecipeDraft = {
  uuid?: string
  title: string
  subtitle?: string
  source: RecipeSource
  ingredients: IngredientGroup[]
  steps: Step[]
  notes?: string
  tags?: string[]
  yield?: Recipe['yield']
  times?: Recipe['times']
}

/* ------------------------------------------------------------------ recipes */

export async function listRecipes(): Promise<Recipe[]> {
  const rows = await db.recipes.toArray()
  return rows.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
}

export async function getRecipe(uuid: string): Promise<Recipe | undefined> {
  return db.recipes.get(uuid)
}

export async function countRecipes(): Promise<number> {
  return db.recipes.count()
}

/**
 * Fill in the derived half of an ingredient: parse `raw`, then let anything the screen
 * stated explicitly win. `raw` itself is never rewritten — if the parse is wrong, the
 * printed truth is still sitting there and every view falls back to it.
 */
function hydrate(ingredient: Ingredient): Ingredient {
  const parsed = parseIngredientLine(ingredient.raw)
  const merged: Ingredient = { ...parsed }
  if (ingredient.quantity !== undefined) merged.quantity = ingredient.quantity
  if (ingredient.unit) merged.unit = ingredient.unit
  if (ingredient.item) {
    merged.item = ingredient.item
    merged.canonical = normalize(ingredient.item)
  }
  if (ingredient.note) merged.note = ingredient.note
  if (ingredient.optional !== undefined) merged.optional = ingredient.optional
  return merged
}

/**
 * Find or mint a registry entry for a canonical name. Exact `canonical` match first, then
 * an `aliases` match, then create.
 *
 * NEVER auto-merges two existing entries. `pepper` and `bell pepper` are not the same
 * thing, and neither are `cream` and `sour cream` — a lookalike is a suggestion in
 * Settings, not a silent rewrite of her data.
 */
async function resolveIngredientUuid(canonical: string, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(canonical)
  if (cached) return cached

  const exact = await db.ingredients.where('canonical').equals(canonical).first()
  if (exact) {
    cache.set(canonical, exact.uuid)
    return exact.uuid
  }

  const byAlias = await db.ingredients.where('aliases').equals(canonical).first()
  if (byAlias) {
    cache.set(canonical, byAlias.uuid)
    return byAlias.uuid
  }

  const entry: IngredientEntry = {
    uuid: newId(),
    canonical,
    aliases: [],
    isStaple: SEEDED_STAPLES.includes(canonical),
    createdAt: now(),
    seenCount: 0,
  }
  await db.ingredients.put(entry)
  cache.set(canonical, entry.uuid)
  return entry.uuid
}

/** Recount from the recipes table rather than incrementing — idempotent by construction. */
async function refreshSeenCounts(uuids: Iterable<string>): Promise<void> {
  for (const uuid of new Set(uuids)) {
    const seenCount = await db.recipes.where('ingredientIndex').equals(uuid).count()
    const entry = await db.ingredients.get(uuid)
    if (entry && entry.seenCount !== seenCount) {
      await db.ingredients.put({ ...entry, seenCount })
    }
  }
}

export type SaveOptions = {
  /**
   * `true` (default) means she pressed Save on this screen. Bulk-loaded recipes — the
   * starter set, a future Gutenberg import — pass `false`: nobody has looked at them yet.
   * Her first Save on one flips it to `true`. There is no third state.
   */
  verified?: boolean
}

/**
 * Upsert a recipe. Its uuid is minted once, at creation, and never changes again — not on
 * an edit, not on a re-parse, not on a re-import (D3). That single rule is what makes
 * import an upsert instead of an append.
 */
export async function saveRecipe(draft: RecipeDraft, options: SaveOptions = {}): Promise<Recipe> {
  const timestamp = now()
  const uuid = draft.uuid ?? newId()

  const ingredients: IngredientGroup[] = draft.ingredients
    .map((group) => ({
      ...(group.heading ? { heading: group.heading } : {}),
      items: group.items.filter((item) => item.raw.trim()).map(hydrate),
    }))
    .filter((group) => group.items.length > 0)

  const steps: Step[] = draft.steps
    .filter((step) => step.text.trim())
    .map((step, index) => ({ n: index + 1, text: step.text.trim() }))

  const cache = new Map<string, string>()
  const ingredientIndex: string[] = []
  for (const name of canonicalNames(ingredients)) {
    ingredientIndex.push(await resolveIngredientUuid(name, cache))
  }

  const existing = await db.recipes.get(uuid)
  const recipe: Recipe = {
    uuid,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    title: draft.title.trim() || 'Untitled',
    ...(draft.subtitle?.trim() ? { subtitle: draft.subtitle.trim() } : {}),
    source: await withBookCitation(draft.source),
    ...(draft.yield ? { yield: draft.yield } : {}),
    ...(draft.times ? { times: draft.times } : {}),
    ingredients,
    steps,
    ...(draft.notes?.trim() ? { notes: draft.notes.trim() } : {}),
    tags: draft.tags ?? existing?.tags ?? [],
    photos: existing?.photos ?? [],
    ingredientIndex,
    ...(existing?.parse ? { parse: existing.parse } : {}),
    verified: options.verified ?? true,
  }

  await db.recipes.put(recipe)
  await refreshSeenCounts([...(existing?.ingredientIndex ?? []), ...ingredientIndex])
  return recipe
}

/**
 * A recipe that points at one of her books also carries the book's citation as text, so
 * the source line, search and a backup all read right without a join — and survive the
 * book being deleted. The uuid is the link; the text is the convenience.
 */
async function withBookCitation(source: RecipeSource): Promise<RecipeSource> {
  if (source.kind !== 'book' || !source.bookUuid) return source
  const book = await db.books.get(source.bookUuid)
  if (!book) return source
  return { ...source, citation: bookCitation(book) }
}

/**
 * Load the starter recipes (src/seed). Skips any uuid already on the device — pressing the
 * button twice adds nothing, and a starter recipe she has since edited is never overwritten
 * (rule 6). Each one goes through saveRecipe so its ingredients reconcile against HER
 * registry (exact → alias → create) instead of bringing a second "garlic" along, and
 * lands as verified: false — she hasn't looked at it yet.
 */
export async function addStarterRecipes(
  drafts: (RecipeDraft & { uuid: string })[],
): Promise<{ added: number; skipped: number }> {
  let added = 0
  let skipped = 0
  for (const draft of drafts) {
    if (await db.recipes.get(draft.uuid)) {
      skipped += 1
      continue
    }
    await saveRecipe(draft, { verified: false })
    added += 1
  }
  return { added, skipped }
}

/**
 * The off switch for the starter set: removes recipes that carry a source license AND
 * that she has never saved (`verified: false`). One she edited is hers now and stays.
 * Never touches anything without a license — her own recipes have none.
 */
export async function removeStarterRecipes(): Promise<number> {
  const rows = await db.recipes.toArray()
  const starters = rows.filter((r) => r.source.license && !r.verified)
  for (const recipe of starters) await deleteRecipe(recipe.uuid)
  return starters.length
}

/** How many recipes on the device are unedited starters — for the Settings summary. */
export async function countStarterRecipes(): Promise<number> {
  const rows = await db.recipes.toArray()
  return rows.filter((r) => r.source.license && !r.verified).length
}

export async function deleteRecipe(uuid: string): Promise<void> {
  const existing = await db.recipes.get(uuid)
  if (!existing) return
  await db.recipes.delete(uuid)
  for (const photo of existing.photos) await db.photos.delete(photo.uuid)
  await refreshSeenCounts(existing.ingredientIndex)
}

/* --------------------------------------------------------------- ingredients */

export async function listIngredients(): Promise<IngredientEntry[]> {
  const rows = await db.ingredients.toArray()
  return rows.sort((a, b) => b.seenCount - a.seenCount || a.canonical.localeCompare(b.canonical))
}

export async function setStaple(uuid: string, isStaple: boolean): Promise<void> {
  const entry = await db.ingredients.get(uuid)
  if (!entry) return
  await db.ingredients.put({ ...entry, isStaple })
}

/* --------------------------------------------------------------------- books */

export async function listBooks(): Promise<Book[]> {
  const rows = await db.books.toArray()
  return rows.sort((a, b) => a.title.localeCompare(b.title))
}

export async function getBook(uuid: string): Promise<Book | undefined> {
  return db.books.get(uuid)
}

export async function countBooks(): Promise<number> {
  return db.books.count()
}

/**
 * The duplicate check: before creating a book from a scan, look it up by ISBN. Hit → open
 * the existing one. This is what stops "I scanned it twice and now have two Zuni Cafés",
 * and it works only because isbn13 is indexed even though it is not the key.
 */
export async function findBookByIsbn(isbn: string): Promise<Book | undefined> {
  const isbn13 = normalizeIsbn(isbn)
  if (!isbn13) return undefined
  return db.books.where('externalRefs.isbn13').equals(isbn13).first()
}

/** What a screen hands over for a book. Everything else is filled in here. */
export type BookDraft = {
  uuid?: string
  title: string
  subtitle?: string
  authors: string[]
  publisher?: string
  publishedYear?: number
  externalRefs?: Book['externalRefs']
  shelfNote?: string
  source: Book['source']
  lookedUpAt?: string
}

/**
 * Upsert a book. Its uuid is minted once and never changes (D3). Recipes that point at
 * it get their citation text refreshed so a corrected title shows everywhere.
 */
export async function saveBook(draft: BookDraft): Promise<Book> {
  const timestamp = now()
  const uuid = draft.uuid ?? newId()
  const existing = await db.books.get(uuid)
  const isbn13 = draft.externalRefs?.isbn13 ? normalizeIsbn(draft.externalRefs.isbn13) : undefined
  const book: Book = {
    uuid,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
    title: draft.title.trim() || 'Untitled book',
    ...(draft.subtitle?.trim() ? { subtitle: draft.subtitle.trim() } : {}),
    authors: draft.authors.map((a) => a.trim()).filter(Boolean),
    ...(draft.publisher?.trim() ? { publisher: draft.publisher.trim() } : {}),
    ...(draft.publishedYear ? { publishedYear: draft.publishedYear } : {}),
    externalRefs: { ...(draft.externalRefs ?? {}), ...(isbn13 ? { isbn13 } : {}) },
    ...(existing?.cover ? { cover: existing.cover } : {}),
    ...(draft.shelfNote?.trim() ? { shelfNote: draft.shelfNote.trim() } : {}),
    ...(draft.lookedUpAt ?? existing?.lookedUpAt ? { lookedUpAt: draft.lookedUpAt ?? existing?.lookedUpAt } : {}),
    source: draft.source,
  }
  await db.books.put(book)

  const citation = bookCitation(book)
  const linked = await db.recipes.where('source.bookUuid').equals(uuid).toArray()
  for (const recipe of linked) {
    if (recipe.source.citation !== citation) {
      await db.recipes.put({ ...recipe, source: { ...recipe.source, citation } })
    }
  }
  return book
}

/**
 * Deleting a book never deletes a recipe. Recipes that pointed at it keep their citation
 * text and lose the link — the page number still means something on its own.
 */
export async function deleteBook(uuid: string): Promise<void> {
  const book = await db.books.get(uuid)
  if (!book) return
  const linked = await db.recipes.where('source.bookUuid').equals(uuid).toArray()
  for (const recipe of linked) {
    const { bookUuid: _dropped, ...rest } = recipe.source
    await db.recipes.put({ ...recipe, source: rest })
  }
  if (book.cover) await db.photos.delete(book.cover.uuid)
  await db.books.delete(uuid)
}

export async function recipesForBook(bookUuid: string): Promise<Recipe[]> {
  const rows = await db.recipes.where('source.bookUuid').equals(bookUuid).toArray()
  return rows.sort((a, b) => (a.source.pageStart ?? 1e9) - (b.source.pageStart ?? 1e9) || a.title.localeCompare(b.title))
}

/** Store the downloaded cover once; a book without one is still a book. */
export async function setBookCover(bookUuid: string, blob: Blob, size?: { width: number; height: number }): Promise<void> {
  const book = await db.books.get(bookUuid)
  if (!book) return
  if (book.cover) await db.photos.delete(book.cover.uuid)
  const ref = await savePhoto(blob, 'other', size)
  await db.books.put({ ...book, cover: ref, updatedAt: now() })
}

/* -------------------------------------------------------------------- photos */

/** Blobs live in their own table so a list query never drags JPEGs into memory. */
export async function savePhoto(blob: Blob, kind: PhotoRef['kind'], size?: { width: number; height: number }): Promise<PhotoRef> {
  const row: PhotoBlob = { uuid: newId(), blob, mime: blob.type || 'image/jpeg', createdAt: now() }
  await db.photos.put(row)
  return { uuid: row.uuid, kind, bytes: blob.size, ...(size ?? {}) }
}

export async function getPhotoBlob(uuid: string): Promise<Blob | undefined> {
  return (await db.photos.get(uuid))?.blob
}

/**
 * Attach a photo of the dish she made. The first dish photo is the recipe's thumbnail.
 * Dish photos are hers: a later crop may overwrite the bytes (see replacePhotoBytes).
 * Page photos (phase 4) are evidence and never go through that path.
 */
export async function addDishPhoto(recipeUuid: string, blob: Blob, size?: { width: number; height: number }): Promise<PhotoRef | undefined> {
  const recipe = await db.recipes.get(recipeUuid)
  if (!recipe) return undefined
  const ref = await savePhoto(blob, 'dish', size)
  await db.recipes.put({ ...recipe, photos: [...recipe.photos, ref], updatedAt: now() })
  return ref
}

/**
 * Overwrite a photo's bytes in place — the destructive crop for a DISH photo. Same uuid,
 * so nothing that references it changes. Refuses page photos: those are cropped
 * non-destructively with a `crop` rect, because the original is the evidence.
 */
export async function replacePhotoBytes(recipeUuid: string, photoUuid: string, blob: Blob, size?: { width: number; height: number }): Promise<void> {
  const recipe = await db.recipes.get(recipeUuid)
  const ref = recipe?.photos.find((p) => p.uuid === photoUuid)
  if (!recipe || !ref) return
  if (ref.kind === 'page') throw new Error('Page photos are evidence and are never overwritten.')
  const row = await db.photos.get(photoUuid)
  if (!row) return
  await db.photos.put({ ...row, blob, mime: blob.type || row.mime })
  const photos = recipe.photos.map((p) => (p.uuid === photoUuid ? { ...p, bytes: blob.size, ...(size ?? {}) } : p))
  await db.recipes.put({ ...recipe, photos, updatedAt: now() })
}

export async function removePhoto(recipeUuid: string, photoUuid: string): Promise<void> {
  const recipe = await db.recipes.get(recipeUuid)
  if (!recipe) return
  await db.photos.delete(photoUuid)
  await db.recipes.put({ ...recipe, photos: recipe.photos.filter((p) => p.uuid !== photoUuid), updatedAt: now() })
}

/* ------------------------------------------------------------------ settings */

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(SETTINGS_KEY)) ?? defaultSettings()
}

export async function updateSettings(patch: Partial<Omit<Settings, 'key'>>): Promise<Settings> {
  const current = await getSettings()
  const next: Settings = { ...current, ...patch, key: SETTINGS_KEY }
  await db.settings.put(next)
  return next
}

/* ---------------------------------------------------------------- categories */

/**
 * The category vocabulary. Seeded lazily from the presets on first read rather than
 * written at install time, so a device that predates the feature gets them too and
 * nothing had to migrate.
 */
export async function listCategories(): Promise<string[]> {
  const settings = await getSettings()
  return settings.categories ?? [...PRESET_CATEGORIES]
}

export async function addCategoryToList(name: string): Promise<string[]> {
  const next = addCategory(await listCategories(), name)
  await updateSettings({ categories: next })
  return next
}

/**
 * Removes it from the vocabulary ONLY. Recipes carrying that tag keep it — it still shows
 * on the recipe, is still found by search, and can still be un-picked one recipe at a
 * time. Tidying a list is not permission to edit her recipes (non-negotiable 6).
 */
export async function removeCategoryFromList(name: string): Promise<string[]> {
  const next = removeCategory(await listCategories(), name)
  await updateSettings({ categories: next })
  return next
}

/* --------------------------------------------------------------------- danger */

/**
 * Wipes everything. Reachable from exactly two places: the round-trip test, and a
 * Settings button that sits behind an explicit confirm. Never called to "fix" a bug —
 * if a migration might lose rows, the answer is to stop and ask her, not to clear the box.
 */
export async function wipeEverything(): Promise<void> {
  await db.transaction('rw', db.recipes, db.books, db.ingredients, db.photos, db.settings, async () => {
    await Promise.all([
      db.recipes.clear(),
      db.books.clear(),
      db.ingredients.clear(),
      db.photos.clear(),
      db.settings.clear(),
    ])
  })
}
