import { describe, it, expect } from 'vitest'
import { PastedParseError, extractJson, readPastedParse } from '../pasted-parse'

/**
 * The bring-your-own-AI path has to cope with what chat assistants actually return:
 * code fences, an apology in front, a summary after, and three different opinions about
 * what the steps field is called. None of that is hers to clean up by hand.
 */
describe('extractJson', () => {
  it('reads a bare object', () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}')
  })

  it('reads through code fences and surrounding chatter', () => {
    expect(extractJson('Sure! Here you go:\n```json\n{"a":1}\n```\nHope that helps.')).toBe('{"a":1}')
    expect(extractJson('```\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJson('Here is the recipe: {"a":1} — let me know!')).toBe('{"a":1}')
  })

  it('says so when there is nothing to read', () => {
    expect(() => extractJson('   ')).toThrow(PastedParseError)
    expect(() => extractJson('I cannot read that photograph.')).toThrow(/JSON/)
  })
})

describe('readPastedParse', () => {
  const full = JSON.stringify({
    notARecipe: false,
    title: 'Fennel gratin',
    yield: 'Serves 4',
    times: { prepMinutes: 10, cookMinutes: 25, totalMinutes: 35 },
    ingredients: [
      {
        heading: 'For the gratin',
        items: [
          { raw: '3 bulbs fennel', quantity: 3, unit: 'bulbs', item: 'fennel', canonical: 'fennel', note: null, optional: false },
          { raw: 'thyme, to serve', optional: true },
        ],
      },
    ],
    steps: ['Braise the fennel.', 'Bake with cream.'],
    lowConfidenceFields: ['ingredients.0.quantity'],
  })

  it('reads the shape our own prompt asks for', () => {
    const parsed = readPastedParse(full)
    expect(parsed.title).toBe('Fennel gratin')
    expect(parsed.yield).toBe('Serves 4')
    expect(parsed.times).toEqual({ prepMinutes: 10, cookMinutes: 25, totalMinutes: 35 })
    expect(parsed.ingredients[0].heading).toBe('For the gratin')
    expect(parsed.ingredients[0].items[0].raw).toBe('3 bulbs fennel')
    expect(parsed.ingredients[0].items[1].optional).toBe(true)
    expect(parsed.steps).toEqual(['Braise the fennel.', 'Bake with cream.'])
    expect(parsed.lowConfidenceFields).toEqual(['ingredients.0.quantity'])
  })

  it('copes with a flat list of ingredient strings', () => {
    const parsed = readPastedParse('{"title":"Soup","ingredients":["1 onion","2 cloves garlic"],"steps":["Cook it."]}')
    expect(parsed.ingredients).toHaveLength(1)
    expect(parsed.ingredients[0].heading).toBeNull()
    expect(parsed.ingredients[0].items.map((i) => i.raw)).toEqual(['1 onion', '2 cloves garlic'])
  })

  it('accepts the other names assistants use for the method', () => {
    for (const key of ['steps', 'method', 'instructions', 'directions']) {
      const parsed = readPastedParse(`{"ingredients":["1 onion"],"${key}":["Chop it."]}`)
      expect(parsed.steps, key).toEqual(['Chop it.'])
    }
  })

  it('takes a method written as one blob, and strips the numbering', () => {
    const parsed = readPastedParse('{"ingredients":["1 onion"],"method":"1. Chop it.\\n2. Fry it."}')
    expect(parsed.steps).toEqual(['Chop it.', 'Fry it.'])
  })

  it('takes step objects and numbered strings', () => {
    const parsed = readPastedParse('{"ingredients":["1 onion"],"steps":[{"text":"1) Chop it."},"2) Fry it."]}')
    expect(parsed.steps).toEqual(['Chop it.', 'Fry it.'])
  })

  it('reads quantities given as strings, and never invents a missing field', () => {
    const parsed = readPastedParse('{"ingredients":[{"raw":"200 g flour","quantity":"200","unit":"g"}],"steps":["Mix."]}')
    expect(parsed.ingredients[0].items[0]).toMatchObject({ quantity: 200, unit: 'g' })
    expect(parsed.title).toBeNull()
    expect(parsed.yield).toBeNull()
    expect(parsed.times).toBeNull()
  })

  it('refuses a reply with nothing usable in it, rather than making an empty recipe', () => {
    expect(() => readPastedParse('{"title":"Nice"}')).toThrow(/ingredients or steps/)
    expect(() => readPastedParse('{"notARecipe":true,"ingredients":["x"],"steps":["y"]}')).toThrow(/isn't a recipe/)
    expect(() => readPastedParse('not json at all')).toThrow(PastedParseError)
  })

  it('drops empty ingredient lines instead of making rows to delete', () => {
    const parsed = readPastedParse('{"ingredients":["1 onion","","   ",{"raw":""}],"steps":["Cook."]}')
    expect(parsed.ingredients[0].items).toHaveLength(1)
  })
})
