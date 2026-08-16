import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import {
  getRecipe,
  listIngredients,
  mergeIngredients,
  saveRecipe,
  setStaple,
  wipeEverything,
} from '../repo'

/**
 * Merging repoints recipes; it never removes one. The properties worth protecting are that
 * her recipes survive intact, the old spelling keeps resolving, and a staple stays a staple.
 */
describe('mergeIngredients', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  async function twoSpellings() {
    await saveRecipe({
      title: 'Soup',
      source: { kind: 'handwritten' },
      ingredients: [{ items: [{ raw: '500 ml chicken stock' }] }],
      steps: [{ n: 1, text: 'Simmer.' }],
      notes: 'Hers.',
    })
    await saveRecipe({
      title: 'Risotto',
      source: { kind: 'handwritten' },
      ingredients: [{ items: [{ raw: '500 ml chicken broth' }] }],
      steps: [{ n: 1, text: 'Stir.' }],
    })
    const rows = await listIngredients()
    const stock = rows.find((r) => r.canonical === 'chicken stock')!
    const broth = rows.find((r) => r.canonical === 'chicken broth')!
    return { stock, broth }
  }

  it('folds one spelling into the other and keeps both recipes', async () => {
    const { stock, broth } = await twoSpellings()
    const result = await mergeIngredients(broth.uuid, stock.uuid)
    expect(result).toEqual({ recipesRepointed: 1, alias: 'chicken broth' })

    const rows = await listIngredients()
    expect(rows.map((r) => r.canonical)).toContain('chicken stock')
    expect(rows.map((r) => r.canonical)).not.toContain('chicken broth')

    // The old spelling still resolves, so the next recipe written that way lands here.
    const survivor = rows.find((r) => r.canonical === 'chicken stock')!
    expect(survivor.aliases).toContain('chicken broth')
    // Both recipes still exist and both now count towards the one entry.
    expect(survivor.seenCount).toBe(2)
  })

  it('repoints the recipe without touching anything of hers', async () => {
    const { stock, broth } = await twoSpellings()
    const risotto = (await listIngredients(), await getRecipeByTitle('Risotto'))
    await mergeIngredients(broth.uuid, stock.uuid)
    const after = await getRecipe(risotto.uuid)

    expect(after!.ingredientIndex).toEqual([stock.uuid])
    expect(after!.ingredients[0].items[0].raw).toBe('500 ml chicken broth')
    expect(after!.title).toBe('Risotto')
    expect(after!.steps).toEqual(risotto.steps)
  })

  it('keeps the staple flag if either side had it', async () => {
    const { stock, broth } = await twoSpellings()
    await setStaple(broth.uuid, true)
    await mergeIngredients(broth.uuid, stock.uuid)
    const survivor = (await listIngredients()).find((r) => r.canonical === 'chicken stock')!
    expect(survivor.isStaple).toBe(true)
  })

  it('refuses to merge an entry into itself, or a missing one', async () => {
    const { stock } = await twoSpellings()
    expect(await mergeIngredients(stock.uuid, stock.uuid)).toBeUndefined()
    expect(await mergeIngredients('nope', stock.uuid)).toBeUndefined()
  })
})

/** Small helper: the repo exposes recipes by uuid, and the tests know them by title. */
async function getRecipeByTitle(title: string) {
  const { listRecipes } = await import('../repo')
  const all = await listRecipes()
  return all.find((r) => r.title === title)!
}
