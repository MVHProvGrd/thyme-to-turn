import { describe, it, expect } from 'vitest'
import { STARTER_COUNT, loadStarterRecipes } from '../index'
import { parseIngredientLine } from '../../lib/ingredients'

/**
 * The starter set is data, and data can rot: a rerun of the fetch script could drop a
 * page, change a uuid, or let wiki markup through. These pin what the app relies on.
 */
describe('starter recipes: the data itself', () => {
  it('is exactly the advertised count, every uuid unique and stable-looking', async () => {
    const seed = await loadStarterRecipes()
    expect(seed).toHaveLength(STARTER_COUNT)
    expect(new Set(seed.map((r) => r.uuid)).size).toBe(seed.length)
    for (const r of seed) expect(r.uuid).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('carries provenance on every recipe — source, url and licence', async () => {
    for (const r of await loadStarterRecipes()) {
      expect(r.source.kind).toBe('web')
      expect(r.source.citation).toBe('Wikibooks Cookbook')
      expect(r.source.url).toMatch(/^https:\/\/en\.wikibooks\.org\/wiki\/Cookbook:/)
      expect(r.source.license).toBe('CC BY-SA 4.0')
    }
  })

  it('is cookable: ingredient lines, steps, and no wiki markup left in either', async () => {
    for (const r of await loadStarterRecipes()) {
      const items = r.ingredients.flatMap((g) => g.items)
      expect(items.length, r.title).toBeGreaterThanOrEqual(3)
      expect(r.steps.length, r.title).toBeGreaterThanOrEqual(2)
      for (const item of items) expect(item.raw, r.title).not.toMatch(/\{\{|\[\[|<|''|&\w+;/)
      for (const step of r.steps) expect(step.text, r.title).not.toMatch(/\{\{|\[\[|<|''|&\w+;/)
    }
  })

  it('parses into ingredients the pantry can match — at least 80% of lines per recipe', async () => {
    for (const r of await loadStarterRecipes()) {
      const items = r.ingredients.flatMap((g) => g.items)
      const parsed = items.filter((i) => parseIngredientLine(i.raw).canonical)
      expect(parsed.length / items.length, r.title).toBeGreaterThanOrEqual(0.8)
    }
  })

  it('never writes into her notes', async () => {
    for (const r of await loadStarterRecipes()) expect((r as { notes?: string }).notes).toBeUndefined()
  })
})
