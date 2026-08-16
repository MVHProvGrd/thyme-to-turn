import { describe, it, expect } from 'vitest'
import { countDoubts, draftFromParsed, groupsFromLines, isDoubted } from '../parse-result'
import type { ParsedRecipe } from '../types'

function parsed(partial: Partial<ParsedRecipe> = {}): ParsedRecipe {
  return {
    notARecipe: false,
    title: 'Roast chicken',
    yield: 'Serves 4',
    times: null,
    ingredients: [],
    steps: [],
    lowConfidenceFields: [],
    ...partial,
  }
}

const line = (raw: string, extra: Record<string, unknown> = {}) => ({
  raw,
  quantity: null,
  unit: null,
  item: null,
  canonical: null,
  note: null,
  optional: false,
  ...extra,
})

describe('draftFromParsed', () => {
  it('keeps `raw` exactly as printed — the one thing that must never be rewritten', () => {
    const draft = draftFromParsed(
      parsed({ ingredients: [{ heading: null, items: [line('1½ cups (190 g) flour, sifted')] }] }),
    )
    expect(draft.lines[0].raw).toBe('1½ cups (190 g) flour, sifted')
  })

  it("prefers the model's own split — it could see the page — and falls back to ours", () => {
    const draft = draftFromParsed(
      parsed({
        ingredients: [
          {
            heading: null,
            items: [
              line('2 bulbs fennel', { quantity: 2, unit: 'bulbs', item: 'fennel' }),
              line('400 g spaghetti'), // nothing supplied: our normalizer fills it in
            ],
          },
        ],
      }),
    )
    expect(draft.lines[0]).toMatchObject({ quantity: '2 bulbs', item: 'fennel' })
    expect(draft.lines[1]).toMatchObject({ quantity: '400 g', item: 'spaghetti' })
  })

  it('flattens groups in page order and carries the optional flag', () => {
    const draft = draftFromParsed(
      parsed({
        ingredients: [
          { heading: 'For the crust', items: [line('200 g flour')] },
          { heading: 'To serve', items: [line('parsley', { optional: true })] },
        ],
      }),
    )
    expect(draft.lines.map((l) => l.item)).toEqual(['flour', 'parsley'])
    expect(draft.lines[1].optional).toBe(true)
  })

  it('drops blank lines rather than making an empty row to delete', () => {
    const draft = draftFromParsed(
      parsed({ ingredients: [{ heading: null, items: [line('  '), line('1 onion')] }] }),
    )
    expect(draft.lines).toHaveLength(1)
  })

  it('joins steps one per line, and copes with everything being null', () => {
    expect(draftFromParsed(parsed({ steps: ['Heat the oven.', 'Roast it.'] })).method).toBe(
      'Heat the oven.\nRoast it.',
    )
    const empty = draftFromParsed(parsed({ title: null, yield: null, steps: [], ingredients: [] }))
    expect(empty).toMatchObject({ title: '', yieldText: '', method: '', lines: [] })
  })
})

describe('isDoubted — what the form points at', () => {
  const doubts = new Set(['title', 'ingredients.0.quantity', 'steps.2'])

  it('matches the exact path', () => {
    expect(isDoubted(doubts, 'title')).toBe(true)
    expect(isDoubted(doubts, 'ingredients.0.quantity')).toBe(true)
    expect(isDoubted(doubts, 'ingredients.1.quantity')).toBe(false)
  })

  it('matches children, so a doubt about a whole line lights up its fields', () => {
    expect(isDoubted(new Set(['ingredients.0']), 'ingredients.0.quantity')).toBe(true)
    // ...but not a sibling that merely starts with the same text.
    expect(isDoubted(new Set(['ingredients.1']), 'ingredients.10.quantity')).toBe(false)
  })

  it('counts what she is being asked to check', () => {
    expect(countDoubts(draftFromParsed(parsed({ lowConfidenceFields: ['title', 'steps.0'] })))).toBe(2)
  })
})

describe('groupsFromLines', () => {
  it('makes the shape repo.saveRecipe wants, keeping optional and dropping blanks', () => {
    expect(
      groupsFromLines([
        { raw: '1 onion', quantity: '1', item: 'onion', optional: false },
        { raw: '  ', quantity: '', item: '', optional: false },
        { raw: 'parsley', quantity: '', item: 'parsley', optional: true },
      ]),
    ).toEqual([{ items: [{ raw: '1 onion' }, { raw: 'parsley', optional: true }] }])
  })

  it('is empty rather than a group with nothing in it', () => {
    expect(groupsFromLines([])).toEqual([])
  })
})
