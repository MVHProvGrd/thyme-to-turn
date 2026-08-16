import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import { db } from '../db'
import { exportBackup, importBackup } from '../backup'
import { listIngredients, listRecipes, saveRecipe, wipeEverything } from '../repo'

/**
 * The phase 1 acceptance test, written as the plan states it:
 *
 *   seed → export → wipe → import → assert identical
 *        → import the SAME file again → assert the count did not change
 *
 * The last line is the one that catches the real bug. An import that restores correctly
 * but duplicates on a second run is the failure mode the coin tracker shipped and then
 * had to live with; we have uuids specifically so we don't have to.
 */

async function seedThree() {
  await saveRecipe({
    title: 'Roast chicken with fennel',
    source: { kind: 'book', citation: 'The Zuni Café Cookbook', pageStart: 214 },
    ingredients: [
      {
        items: [
          { raw: '1 whole chicken, about 1.5 kg' },
          { raw: '2 bulbs fennel, sliced' },
          { raw: '2 tbsp olive oil' },
        ],
      },
    ],
    steps: [{ n: 1, text: 'Salt the bird a day ahead.' }, { n: 2, text: 'Roast hot.' }],
  })
  await saveRecipe({
    title: 'Lentil soup',
    source: { kind: 'other', citation: 'Mum' },
    ingredients: [{ items: [{ raw: '250 g brown lentils' }, { raw: '1 onion, diced' }, { raw: 'salt' }] }],
    steps: [{ n: 1, text: 'Simmer everything for 40 minutes.' }],
    notes: 'Half the salt next time.',
  })
  await saveRecipe({
    title: 'Pasta with anchovies and breadcrumbs',
    source: { kind: 'book', citation: 'River Cafe Cook Book', pageStart: 88 },
    ingredients: [{ items: [{ raw: '400 g spaghetti' }, { raw: '6 anchovies' }, { raw: '2 cloves garlic' }] }],
    steps: [{ n: 1, text: 'Fry the crumbs in oil.' }],
  })
}

beforeEach(async () => {
  await db.open()
  await wipeEverything()
})

describe('storage survives the round trip', () => {
  it('export → wipe → import restores exactly what was there', async () => {
    await seedThree()
    const before = await listRecipes()
    expect(before).toHaveLength(3)

    const { text } = await exportBackup()

    await wipeEverything()
    expect(await listRecipes()).toHaveLength(0)

    await importBackup(text)
    const after = await listRecipes()

    expect(after).toHaveLength(3)
    expect(after.map((r) => r.uuid).sort()).toEqual(before.map((r) => r.uuid).sort())
    expect(after).toEqual(before)
  })

  it('importing the same file twice does not duplicate anything', async () => {
    await seedThree()
    const { text } = await exportBackup()
    await wipeEverything()

    const first = await importBackup(text)
    expect(first.recipeCount).toBe(3)

    const second = await importBackup(text)
    expect(second.recipeCount).toBe(3)
    expect(await listRecipes()).toHaveLength(3)
    expect(second.lines[0]).toMatch(/0 new/)
  })

  it('a backup merged into a live device adds without clobbering', async () => {
    await seedThree()
    const { text } = await exportBackup()

    // She keeps cooking on the device, then imports an older backup of the same box.
    await saveRecipe({
      title: 'Tarte tatin',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '6 apples' }] }],
      steps: [],
    })

    await importBackup(text)
    const titles = (await listRecipes()).map((r) => r.title)
    expect(titles).toHaveLength(4)
    expect(titles).toContain('Tarte tatin')
  })

  it('never exports the API key, because the key is not in the database at all', async () => {
    await seedThree()
    const { text } = await exportBackup()
    expect(text).not.toMatch(/sk-ant/)
    expect(text).not.toMatch(/apiKey/i)
  })
})

describe('the ingredient registry', () => {
  it('populates itself from typed entry and counts what it sees', async () => {
    await seedThree()
    const registry = await listIngredients()
    const names = registry.map((e) => e.canonical)

    expect(names).toContain('garlic')
    expect(names).toContain('brown lentil')
    expect(names).toContain('fennel')

    const salt = registry.find((e) => e.canonical === 'salt')
    expect(salt?.isStaple).toBe(true)
    // Deliberately not a staple: people genuinely run out of onions.
    expect(registry.find((e) => e.canonical === 'onion')?.isStaple).toBe(false)
  })

  it('gives the same ingredient in two recipes one uuid, not two', async () => {
    await saveRecipe({
      title: 'A',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '2 cloves garlic' }] }],
      steps: [],
    })
    await saveRecipe({
      title: 'B',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '1 clove of garlic, crushed' }] }],
      steps: [],
    })

    const garlic = (await listIngredients()).filter((e) => e.canonical === 'garlic')
    expect(garlic).toHaveLength(1)
    expect(garlic[0].seenCount).toBe(2)

    const recipes = await listRecipes()
    expect(recipes[0].ingredientIndex).toEqual(recipes[1].ingredientIndex)
  })

  it('keeps a recipe uuid stable across an edit', async () => {
    const first = await saveRecipe({
      title: 'Soup',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '1 onion' }] }],
      steps: [],
    })
    const second = await saveRecipe({
      uuid: first.uuid,
      title: 'Better soup',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '2 onions' }, { raw: '1 leek' }] }],
      steps: [],
    })

    expect(second.uuid).toBe(first.uuid)
    expect(second.createdAt).toBe(first.createdAt)
    expect(await listRecipes()).toHaveLength(1)
  })

  it('drops the seen count when a recipe is deleted', async () => {
    const recipe = await saveRecipe({
      title: 'Only one',
      source: { kind: 'other' },
      ingredients: [{ items: [{ raw: '3 cardamom pods' }] }],
      steps: [],
    })
    const { deleteRecipe } = await import('../repo')
    await deleteRecipe(recipe.uuid)
    expect((await listIngredients()).find((e) => e.canonical === 'cardamom pod')?.seenCount).toBe(0)
  })
})
