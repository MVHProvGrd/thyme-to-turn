import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import { backfillCanonicals, getRecipe, listIngredients, saveRecipe, wipeEverything } from '../repo'
import { db } from '../db'

/**
 * `canonical` is derived at write time, so improving the normalizer does nothing for
 * recipes already stored. This is the repair pass, and the property that matters is that it
 * repairs ONLY derived data: her printed lines, notes and flags come back untouched.
 *
 * The broken row is written straight to Dexie rather than through `saveRecipe`, because
 * `saveRecipe` would helpfully fix it on the way in — the whole point is a row that the OLD
 * rule produced, sitting on her device today.
 */
describe('backfillCanonicals', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  /** What the old comma-first rule left behind: a real line with no usable match key. */
  async function writeStaleRecipe() {
    const saved = await saveRecipe({
      title: 'Chicken traybake',
      source: { kind: 'handwritten' },
      ingredients: [{ items: [{ raw: '2 skinless, boneless chicken breasts' }] }],
      steps: [{ n: 1, text: 'Roast it.' }],
      notes: 'Hers. Never touched.',
    })
    const stale = await db.recipes.get(saved.uuid)
    // Strip the match key the way the old normalizer would have left it.
    await db.recipes.put({
      ...stale!,
      ingredients: [{ items: [{ raw: '2 skinless, boneless chicken breasts' }] }],
      ingredientIndex: [],
    })
    return saved.uuid
  }

  it('recovers a match key the old rule threw away', async () => {
    const uuid = await writeStaleRecipe()
    expect((await getRecipe(uuid))!.ingredients[0].items[0].canonical).toBeUndefined()

    const report = await backfillCanonicals()
    expect(report.recipesChanged).toBe(1)
    expect(report.ingredientsRecovered).toBe(1)

    const fixed = await getRecipe(uuid)
    expect(fixed!.ingredients[0].items[0].canonical).toBe('chicken breast')
    // And it is now findable by the pantry, which was the entire point.
    expect(fixed!.ingredientIndex).toHaveLength(1)
    expect((await listIngredients()).map((row) => row.canonical)).toContain('chicken breast')
  })

  it('never touches anything of hers', async () => {
    const uuid = await writeStaleRecipe()
    const before = await getRecipe(uuid)
    await backfillCanonicals()
    const after = await getRecipe(uuid)

    expect(after!.ingredients[0].items[0].raw).toBe('2 skinless, boneless chicken breasts')
    expect(after!.notes).toBe('Hers. Never touched.')
    expect(after!.title).toBe(before!.title)
    expect(after!.steps).toEqual(before!.steps)
    expect(after!.verified).toBe(before!.verified)
    // A derived-field repair is not her editing the recipe.
    expect(after!.updatedAt).toBe(before!.updatedAt)
  })

  it('is safe to run twice', async () => {
    await writeStaleRecipe()
    await backfillCanonicals()
    const second = await backfillCanonicals()
    expect(second.recipesChanged).toBe(0)
    expect(second.ingredientsRecovered).toBe(0)
  })

  it('leaves an already-correct collection alone', async () => {
    await saveRecipe({
      title: 'Soup',
      source: { kind: 'handwritten' },
      ingredients: [{ items: [{ raw: '1 large onion, chopped' }] }],
      steps: [{ n: 1, text: 'Simmer.' }],
    })
    const report = await backfillCanonicals()
    expect(report.recipesChecked).toBe(1)
    expect(report.recipesChanged).toBe(0)
  })
})
