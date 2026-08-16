import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import { backfillCanonicals, getRecipe, listIngredients, saveRecipe, wipeEverything } from '../repo'
import { db } from '../db'
import { matchPantry, choicesOf } from '../../lib/pantry'

/**
 * The whole path for a line that offers a choice, from the printed words to the ranking:
 *
 *   "500 g minced or ground lamb or beef"
 *      → two registry entries, lamb and beef
 *      → ONE requirement holding both
 *      → ruling out beef must not hide the recipe
 *
 * `db/repo.ts` is the only writer, so this is where the derived half is proved true.
 */
describe('a recipe line that offers a choice', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  async function saveKofta() {
    return saveRecipe({
      title: 'Kofta',
      source: { kind: 'handwritten' },
      ingredients: [
        { items: [{ raw: '1 onion, grated' }, { raw: '500 g minced or ground lamb or beef' }] },
      ],
      steps: [{ n: 1, text: 'Mix and grill.' }],
    })
  }

  it('mints a registry entry for each option, not one for the whole phrase', async () => {
    await saveKofta()
    const names = (await listIngredients()).map((row) => row.canonical)
    expect(names).toContain('lamb')
    expect(names).toContain('beef')
    // The bug this fixes: the line used to canonicalise to one unmatchable string.
    expect(names).not.toContain('lamb beef')
  })

  it('stores the two options as ONE requirement', async () => {
    const saved = await saveKofta()
    const recipe = (await getRecipe(saved.uuid))!
    const registry = await listIngredients()
    const nameOf = (uuid: string) => registry.find((row) => row.uuid === uuid)!.canonical

    expect(choicesOf(recipe).map((uuids) => uuids.map(nameOf))).toEqual([
      ['onion'],
      ['lamb', 'beef'],
    ])
    // The flat index still lists every name — Dexie indexes it and seenCount counts it.
    expect(recipe.ingredientIndex.map(nameOf).sort()).toEqual(['beef', 'lamb', 'onion'])
    expect(recipe.ingredients[0].items[1].canonical).toBe('lamb')
    expect(recipe.ingredients[0].items[1].alternatives).toEqual(['beef'])
    // And the printed line is exactly as printed, as always.
    expect(recipe.ingredients[0].items[1].raw).toBe('500 g minced or ground lamb or beef')
  })

  it('ruling out one option does not hide the recipe', async () => {
    const saved = await saveKofta()
    const recipe = (await getRecipe(saved.uuid))!
    const registry = await listIngredients()
    const uuidOf = (name: string) => registry.find((row) => row.canonical === name)!.uuid

    const [noBeef] = matchPantry([recipe], { [uuidOf('beef')]: 'dontHave' }, registry)
    expect(noBeef.missing).toEqual([])

    const [neither] = matchPantry(
      [recipe],
      { [uuidOf('beef')]: 'dontHave', [uuidOf('lamb')]: 'dontHave' },
      registry,
    )
    expect(neither.missing.map((choice) => choice.label)).toEqual(['lamb or beef'])
  })

  it('repairs a recipe saved before any of this existed', async () => {
    // Written straight to Dexie: saveRecipe would helpfully fix it on the way in, and the
    // point is a row sitting on her phone right now, canonicalised by the old rule.
    const saved = await saveKofta()
    const stored = (await db.recipes.get(saved.uuid))!
    await db.recipes.put({
      ...stored,
      ingredients: [
        {
          items: [
            { raw: '1 onion, grated', item: 'onion', canonical: 'onion' },
            {
              raw: '500 g minced or ground lamb or beef',
              item: 'minced or ground lamb or beef',
              canonical: 'lamb beef',
            },
          ],
        },
      ],
      ingredientIndex: [],
      ingredientChoices: undefined,
    })

    const report = await backfillCanonicals()
    expect(report.recipesChanged).toBe(1)

    const fixed = (await getRecipe(saved.uuid))!
    expect(fixed.ingredients[0].items[1].canonical).toBe('lamb')
    expect(fixed.ingredients[0].items[1].alternatives).toEqual(['beef'])
    expect(fixed.ingredientChoices).toHaveLength(2)
    // Nothing of hers moved.
    expect(fixed.ingredients[0].items[1].raw).toBe('500 g minced or ground lamb or beef')
    expect(fixed.updatedAt).toBe(stored.updatedAt)
  })

  it('running the repair twice changes nothing the second time', async () => {
    await saveKofta()
    await backfillCanonicals()
    expect((await backfillCanonicals()).recipesChanged).toBe(0)
  })
})
