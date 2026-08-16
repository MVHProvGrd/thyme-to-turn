/**
 * The two label vocabularies — categories and tags. PURE.
 *
 * CATEGORIES answer "what kind of meal is this": breakfast, soup, dessert. A recipe is
 * normally in one.
 * TAGS answer "what is it like": kid approved, easy, girl dinner. A recipe carries as many
 * as fit.
 *
 * Two lists, one mechanism — everything below works on either, which is why the functions
 * are named for categories and used by both. Assignments for BOTH land in the same
 * `recipe.tags` array, because that field is already a Dexie multi-entry index and already
 * in the search haystack; the two vocabularies in settings are what tell them apart. A
 * name may live in one list or the other, never both (`repo.ts` refuses the second).
 *
 * These are stored on the recipe as `tags`, the field that has existed since phase 1 and
 * is already a Dexie multi-entry index (`*tags`) and already part of the search haystack.
 * So this feature needs NO schema migration and no new index: it is a managed vocabulary
 * over a field that was always there.
 *
 * The vocabulary itself (which categories exist, presets plus whatever she invents) lives
 * in the single settings row. Two layers, deliberately:
 *
 *   the LIST      what Settings offers her, and what the filter row shows
 *   a recipe's    `tags` — assignments, which survive the list changing
 *
 * Removing a category from the list never strips it from a recipe. Her data is hers
 * (non-negotiable 6); a tag with no list entry still shows on the recipe and is still
 * found by search.
 */

import { fold } from './ingredients'

/** Seeded on first read. Meal times first, then kinds of dish — the order she'd say them. */
export const PRESET_CATEGORIES = [
  'Breakfast',
  'Lunch',
  'Dinner',
  'Soup',
  'Salad',
  'Side',
  'Dessert',
  'Baking',
  'Snack',
  'Drink',
]

/**
 * Seeded on first read, same as the categories. Every one is removable — these are a
 * starting point for the kind of thing a tag is, not a claim about what she cooks.
 */
export const PRESET_TAGS = [
  'Easy',
  'Quick',
  'Kid approved',
  'Family favorite',
  'Make ahead',
  'Girl dinner',
]

/** Chips truncate at 14 characters, so a category longer than this helps nobody. */
export const MAX_CATEGORY_LENGTH = 24

/** Trim and collapse whitespace. Case and wording are hers — we never retitle a category. */
export function normalizeCategory(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_LENGTH).trim()
}

/** "Soup" and "soup" are the same category; "sauté" and "saute" are too. */
export function sameCategory(a: string, b: string): boolean {
  return fold(a) === fold(b)
}

export function hasCategory(tags: string[], name: string): boolean {
  return tags.some((tag) => sameCategory(tag, name))
}

/**
 * Add to the vocabulary. Case-insensitively deduped, so typing "soup" when "Soup" is
 * already there is a no-op rather than a second chip. Empty input is a no-op too.
 */
export function addCategory(list: string[], name: string): string[] {
  const clean = normalizeCategory(name)
  if (!clean || hasCategory(list, clean)) return list
  return [...list, clean]
}

export function removeCategory(list: string[], name: string): string[] {
  return list.filter((entry) => !sameCategory(entry, name))
}

/** Assign or unassign a category on a recipe. Keeps the list's spelling, not the tag's. */
export function toggleCategory(tags: string[], name: string): string[] {
  const clean = normalizeCategory(name)
  if (!clean) return tags
  return hasCategory(tags, clean) ? removeCategory(tags, clean) : [...tags, clean]
}

/** What the dinner screen and the recipe list narrow by, before anything else happens. */
export type LabelFilter = {
  /** One category at a time — a recipe is breakfast or it is dinner. */
  category?: string | null
  /** Every one of these must be on the recipe. Two tags means both, not either. */
  tags?: string[]
}

export function labelFilterIsEmpty(filter: LabelFilter): boolean {
  return !filter.category && (filter.tags ?? []).length === 0
}

/**
 * Narrow a set of recipes by her own labels.
 *
 * Tags are ANDed on purpose. "Kid approved" plus "Quick" means both — that is what picking
 * two things off a list means, and the alternative (either) grows the list as she adds
 * filters, which is backwards. Unlike the ingredient marks there is no honest fallback
 * here: these are her own labels on her own recipes, so "nothing has all of those" is a
 * true and readable answer, and un-tapping one is a single tap away.
 */
export function filterByLabels<T extends { tags: string[] }>(recipes: T[], filter: LabelFilter): T[] {
  if (labelFilterIsEmpty(filter)) return recipes
  const tags = filter.tags ?? []
  return recipes.filter((recipe) => {
    if (filter.category && !hasCategory(recipe.tags, filter.category)) return false
    return tags.every((tag) => hasCategory(recipe.tags, tag))
  })
}

function labelsOn<T extends { tags: string[] }>(recipes: T[]): string[] {
  const used = new Set<string>()
  for (const recipe of recipes) for (const tag of recipe.tags) used.add(tag)
  return [...used]
}

/**
 * Which of a vocabulary is worth offering: only names something actually carries.
 *
 * A filter that can only ever return nothing is worse than no filter, and a list of ten
 * dead chips is exactly the endless scroll of options these screens are trying not to be.
 */
export function vocabularyInUse<T extends { tags: string[] }>(
  recipes: T[],
  vocabulary: string[],
): string[] {
  const used = labelsOn(recipes)
  return vocabulary.filter((name) => used.some((tag) => sameCategory(tag, name)))
}

/**
 * Labels sitting on recipes that belong to no vocabulary at all — what is left after she
 * removes an entry from a list, since removing it never strips it from her recipes.
 *
 * They are offered with the CATEGORIES, not the tags. Both vocabularies write into the
 * same `recipe.tags` array, so once a name is off both lists there is nothing left to say
 * which one it came from; guessing would show it in both places. Categories is where the
 * feature started and where the recipe list already put them.
 */
export function unlistedLabels<T extends { tags: string[] }>(
  recipes: T[],
  ...vocabularies: string[][]
): string[] {
  const known = vocabularies.flat()
  return labelsOn(recipes).filter((tag) => !known.some((name) => sameCategory(name, tag)))
}
