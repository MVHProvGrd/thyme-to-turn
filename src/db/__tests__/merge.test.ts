import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import {
  getRecipe,
  listIngredients,
  mergeIngredients,
  saveRecipe,
  setStaple,
  unmergeAlias,
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

/**
 * The undo. This is what makes a fold safe to try: she can look inside an entry and take a
 * spelling back out, and the recipes that actually used it go with it.
 *
 * It works only because a merge never rewrote the printed lines — the risotto still SAYS
 * chicken broth, which is how it can be found again afterwards.
 */
describe('unmergeAlias', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  async function folded() {
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
    await mergeIngredients(broth.uuid, stock.uuid)
    return { stockUuid: stock.uuid }
  }

  it('sends back the recipe that spelled it the old way, and leaves the other alone', async () => {
    const { stockUuid } = await folded()
    const soupBefore = await getRecipeByTitle('Soup')

    const result = await unmergeAlias(stockUuid, 'chicken broth')
    expect(result).toEqual({ recipesRepointed: 1, canonical: 'chicken stock' })

    const rows = await listIngredients()
    const stock = rows.find((r) => r.canonical === 'chicken stock')!
    const broth = rows.find((r) => r.canonical === 'chicken broth')!
    expect(stock.aliases).not.toContain('chicken broth')

    const risotto = await getRecipeByTitle('Risotto')
    expect(risotto.ingredientIndex).toEqual([broth.uuid])
    // The soup never said "broth", so it does not move.
    const soup = await getRecipeByTitle('Soup')
    expect(soup.ingredientIndex).toEqual([stockUuid])
    expect(soup.notes).toBe(soupBefore.notes)

    // Both counts are recomputed, not guessed at.
    expect(stock.seenCount).toBe(1)
    expect(broth.seenCount).toBe(1)
  })

  it('never touches her printed lines', async () => {
    const { stockUuid } = await folded()
    await unmergeAlias(stockUuid, 'chicken broth')
    const risotto = await getRecipeByTitle('Risotto')
    expect(risotto.ingredients[0].items[0].raw).toBe('500 ml chicken broth')
    expect(risotto.title).toBe('Risotto')
    expect(risotto.steps).toEqual([{ n: 1, text: 'Stir.' }])
  })

  it('drops an alias no recipe ever used, and says nothing moved', async () => {
    const { stockUuid } = await folded()
    // A spelling she folded in by hand that nothing on the shelf actually writes.
    const rows = await listIngredients()
    const stock = rows.find((r) => r.uuid === stockUuid)!
    await saveStubAlias(stock.uuid, 'bouillon')

    expect(await unmergeAlias(stockUuid, 'bouillon')).toEqual({
      recipesRepointed: 0,
      canonical: 'chicken stock',
    })
    const after = (await listIngredients()).find((r) => r.uuid === stockUuid)!
    expect(after.aliases).not.toContain('bouillon')
  })

  it('folds again cleanly after an unfold — the round trip', async () => {
    const { stockUuid } = await folded()
    await unmergeAlias(stockUuid, 'chicken broth')
    const broth = (await listIngredients()).find((r) => r.canonical === 'chicken broth')!

    await mergeIngredients(broth.uuid, stockUuid)
    const stock = (await listIngredients()).find((r) => r.uuid === stockUuid)!
    expect(stock.aliases).toContain('chicken broth')
    expect(stock.seenCount).toBe(2)
  })

  it('does nothing for an alias or an entry that is not there', async () => {
    const { stockUuid } = await folded()
    expect(await unmergeAlias(stockUuid, 'not an alias')).toBeUndefined()
    expect(await unmergeAlias('nope', 'chicken broth')).toBeUndefined()
  })
})

/** Add an alias directly, the way the merge UI would if she folded in a rare spelling. */
async function saveStubAlias(uuid: string, alias: string) {
  const { db } = await import('../db')
  const entry = await db.ingredients.get(uuid)
  await db.ingredients.put({ ...entry!, aliases: [...entry!.aliases, alias] })
}

/** Small helper: the repo exposes recipes by uuid, and the tests know them by title. */
async function getRecipeByTitle(title: string) {
  const { listRecipes } = await import('../repo')
  const all = await listRecipes()
  return all.find((r) => r.title === title)!
}
