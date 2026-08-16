import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import {
  addCategoryToList,
  addTagToList,
  listCategories,
  listTags,
  removeTagFromList,
  saveRecipe,
  wipeEverything,
} from '../repo'
import { PRESET_CATEGORIES, PRESET_TAGS } from '../../lib/categories'

/**
 * Two vocabularies, one field. Both seed lazily from their presets, and a name belongs to
 * one list or the other — never both, or it would sit in two filter menus that mean
 * different things and land in the same place on the recipe.
 */
describe('categories and tags', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  it('seeds each list from its presets without writing anything at install time', async () => {
    expect(await listCategories()).toEqual(PRESET_CATEGORIES)
    expect(await listTags()).toEqual(PRESET_TAGS)
  })

  it('keeps the two lists separate', async () => {
    await addTagToList('Picnic')
    expect(await listTags()).toContain('Picnic')
    expect(await listCategories()).not.toContain('Picnic')
  })

  it('refuses a name that is already in the other list, and says which', async () => {
    const asTag = await addTagToList('Dinner')
    expect(asTag.clash).toBe('category')
    expect(await listTags()).not.toContain('Dinner')

    await addTagToList('Picnic')
    const asCategory = await addCategoryToList('picnic')
    expect(asCategory.clash).toBe('tag')
    expect(await listCategories()).not.toContain('picnic')
  })

  it('removing a tag from the list never strips it from a recipe', async () => {
    const saved = await saveRecipe({
      title: 'Fish fingers',
      source: { kind: 'handwritten' },
      ingredients: [{ items: [{ raw: '8 fish fingers' }] }],
      steps: [],
      tags: ['Dinner', 'Kid approved'],
    })
    await removeTagFromList('Kid approved')
    expect(await listTags()).not.toContain('Kid approved')

    const { getRecipe } = await import('../repo')
    expect((await getRecipe(saved.uuid))!.tags).toEqual(['Dinner', 'Kid approved'])
  })

  it('stores a category and a tag on one recipe, in the one field', async () => {
    const saved = await saveRecipe({
      title: 'Beans on toast',
      source: { kind: 'handwritten' },
      ingredients: [{ items: [{ raw: '1 tin beans' }] }],
      steps: [],
      tags: ['Dinner', 'Girl dinner'],
    })
    const { getRecipe } = await import('../repo')
    expect((await getRecipe(saved.uuid))!.tags).toEqual(['Dinner', 'Girl dinner'])
  })
})
