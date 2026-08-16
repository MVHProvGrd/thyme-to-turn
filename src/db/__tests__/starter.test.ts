import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import {
  addStarterRecipes,
  countStarterRecipes,
  getRecipe,
  listIngredients,
  listRecipes,
  removeStarterRecipes,
  saveRecipe,
  wipeEverything,
} from '../repo'
import { loadStarterRecipes } from '../../seed'

/**
 * The starter set goes through the real repo, so the properties that matter are the
 * repo's: idempotent add, one registry row per ingredient name, her edits are never
 * overwritten or removed, and nothing of hers is touched by "remove".
 */
describe('starter recipes through repo.ts', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  it('adds once; adding again changes nothing', async () => {
    const seed = await loadStarterRecipes()
    const first = await addStarterRecipes(seed)
    expect(first).toEqual({ added: seed.length, skipped: 0 })
    const count = (await listRecipes()).length
    const second = await addStarterRecipes(seed)
    expect(second).toEqual({ added: 0, skipped: seed.length })
    expect((await listRecipes()).length).toBe(count)
  })

  it('lands as verified: false, with provenance intact', async () => {
    const seed = await loadStarterRecipes()
    await addStarterRecipes(seed.slice(0, 5))
    for (const r of await listRecipes()) {
      expect(r.verified).toBe(false)
      expect(r.source.license).toBe('CC BY-SA 4.0')
      expect(r.source.url).toBeTruthy()
    }
  })

  it('reconciles ingredients into HER registry — one garlic, not two', async () => {
    await saveRecipe({
      title: 'Her garlic bread',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '2 cloves garlic' }, { raw: '1 loaf bread' }] }],
      steps: [],
    })
    const before = await listIngredients()
    const garlicBefore = before.filter((e) => e.canonical === 'garlic')
    expect(garlicBefore).toHaveLength(1)

    await addStarterRecipes(await loadStarterRecipes())
    const after = await listIngredients()
    const garlicAfter = after.filter((e) => e.canonical === 'garlic')
    expect(garlicAfter).toHaveLength(1)
    expect(garlicAfter[0].uuid).toBe(garlicBefore[0].uuid)
    expect(garlicAfter[0].seenCount).toBeGreaterThan(1)
    // And no canonical name appears twice anywhere.
    expect(new Set(after.map((e) => e.canonical)).size).toBe(after.length)
  })

  it('never overwrites a starter recipe she has edited, and remove leaves it alone', async () => {
    const seed = await loadStarterRecipes()
    await addStarterRecipes(seed.slice(0, 3))
    const edited = seed[0]
    await saveRecipe({ ...edited, title: 'My version' }) // she pressed Save → verified: true

    const again = await addStarterRecipes(seed.slice(0, 3))
    expect(again.skipped).toBe(3)
    expect((await getRecipe(edited.uuid))?.title).toBe('My version')

    expect(await countStarterRecipes()).toBe(2)
    const removed = await removeStarterRecipes()
    expect(removed).toBe(2)
    expect((await getRecipe(edited.uuid))?.title).toBe('My version')
    expect((await listRecipes()).length).toBe(1)
  })

  it('remove never touches her own recipes', async () => {
    await saveRecipe({ title: 'Hers', source: { kind: 'other' }, ingredients: [], steps: [] })
    await addStarterRecipes((await loadStarterRecipes()).slice(0, 4))
    expect(await removeStarterRecipes()).toBe(4)
    const left = await listRecipes()
    expect(left.map((r) => r.title)).toEqual(['Hers'])
  })
})
