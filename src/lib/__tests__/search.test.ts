import { describe, it, expect } from 'vitest'
import { ingredientCount, searchRecipes } from '../search'
import type { Recipe } from '../types'

function recipe(partial: Partial<Recipe> & { title: string }): Recipe {
  return {
    uuid: partial.title,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    source: { kind: 'other' },
    ingredients: [],
    steps: [],
    tags: [],
    photos: [],
    ingredientIndex: [],
    verified: true,
    ...partial,
  }
}

const recipes = [
  recipe({
    title: 'Roast chicken with fennel',
    source: { kind: 'book', bookUuid: 'zuni', citation: 'The Zuni Café Cookbook', pageStart: 214 },
    ingredients: [{ items: [{ raw: '2 bulbs fennel', item: 'fennel' }] }],
  }),
  recipe({
    title: 'Lentil soup',
    ingredients: [{ items: [{ raw: '1 onion', item: 'onion' }, { raw: 'salt', item: 'salt' }] }],
    tags: ['weeknight'],
  }),
  recipe({ title: 'Fennel gratin' }),
]

describe('searchRecipes', () => {
  it('returns everything for an empty query, in the order it was given', () => {
    expect(searchRecipes(recipes, '')).toEqual(recipes)
    expect(searchRecipes(recipes, '   ')).toEqual(recipes)
  })

  it('requires every word to appear somewhere', () => {
    expect(searchRecipes(recipes, 'roast chicken').map((r) => r.title)).toEqual([
      'Roast chicken with fennel',
    ])
    expect(searchRecipes(recipes, 'roast lentil')).toEqual([])
  })

  it('puts title matches ahead of ingredient matches', () => {
    expect(searchRecipes(recipes, 'fennel').map((r) => r.title)).toEqual([
      'Roast chicken with fennel',
      'Fennel gratin',
    ])
  })

  it('finds a recipe by the book it came from', () => {
    expect(
      searchRecipes(recipes, 'zuni', { bookTitles: { zuni: 'The Zuni Café Cookbook' } }).map((r) => r.title),
    ).toEqual(['Roast chicken with fennel'])
  })

  it('ignores case and accents', () => {
    expect(searchRecipes(recipes, 'CAFE').map((r) => r.title)).toEqual(['Roast chicken with fennel'])
  })

  it('searches tags and ingredients', () => {
    expect(searchRecipes(recipes, 'weeknight').map((r) => r.title)).toEqual(['Lentil soup'])
    expect(searchRecipes(recipes, 'onion').map((r) => r.title)).toEqual(['Lentil soup'])
  })
})

describe('ingredientCount', () => {
  it('counts every line across every group — the simplest-first tiebreak', () => {
    expect(ingredientCount(recipes[1])).toBe(2)
    expect(ingredientCount(recipes[2])).toBe(0)
  })
})
