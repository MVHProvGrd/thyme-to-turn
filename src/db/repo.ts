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
import { now } from '../platform/clock'
import type {
  Book,
  Ingredient,
  IngredientEntry,
  IngredientGroup,
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
    source: draft.source,
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
  return db.books.toArray()
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
