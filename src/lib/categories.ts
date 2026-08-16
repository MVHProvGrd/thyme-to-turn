/**
 * Categories — "breakfast", "soup", "Alisa's mum's". PURE.
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
