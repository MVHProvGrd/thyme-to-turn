/**
 * Text search over plain arrays. PURE — it takes recipes in and gives recipes back, so it
 * is tested without a browser and can be swapped for a Dexie query later without changing
 * a single screen.
 *
 * Deliberately not fuzzy. She has tens of recipes, not tens of thousands; a substring
 * match on words she typed is both predictable and explainable, and "why did that come
 * up?" has no good answer in a scored fuzzy matcher.
 */

import { fold } from './ingredients'
import type { Recipe } from './types'

/** Everything about a recipe that a text search should be able to reach. */
function haystack(recipe: Recipe, bookTitle?: string): string {
  const parts: string[] = [recipe.title, recipe.subtitle ?? '', recipe.source.citation ?? '', bookTitle ?? '']
  for (const tag of recipe.tags) parts.push(tag)
  for (const group of recipe.ingredients) {
    if (group.heading) parts.push(group.heading)
    for (const item of group.items) parts.push(item.item ?? item.raw)
  }
  return fold(parts.join(' '))
}

export type SearchOptions = {
  /** uuid → book title, so "zuni" finds every recipe from that book. */
  bookTitles?: Record<string, string>
}

/**
 * Every word in the query must appear somewhere. Title matches sort first; ties keep the
 * incoming order, which is `updatedAt` descending from repo.ts — so an empty query is
 * "most recently touched", not "arbitrary".
 */
export function searchRecipes(recipes: Recipe[], query: string, options: SearchOptions = {}): Recipe[] {
  const words = fold(query).split(' ').filter(Boolean)
  if (words.length === 0) return recipes

  const scored: { recipe: Recipe; score: number; index: number }[] = []

  recipes.forEach((recipe, index) => {
    const bookTitle = recipe.source.bookUuid ? options.bookTitles?.[recipe.source.bookUuid] : undefined
    const text = haystack(recipe, bookTitle)
    if (!words.every((word) => text.includes(word))) return

    const title = fold(recipe.title)
    const inTitle = words.filter((word) => title.includes(word)).length
    scored.push({ recipe, score: inTitle, index })
  })

  scored.sort((a, b) => b.score - a.score || a.index - b.index)
  return scored.map((entry) => entry.recipe)
}

/** How many ingredient lines a recipe has — the "simplest first" tiebreak. */
export function ingredientCount(recipe: Recipe): number {
  return recipe.ingredients.reduce((total, group) => total + group.items.length, 0)
}
