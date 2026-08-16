import { describe, it, expect } from 'vitest'
import {
  canonicalNames,
  fold,
  formatUnit,
  normalize,
  parseIngredientLine,
  parseQuantity,
} from '../ingredients'

/**
 * The pantry screen is the feature where a wrong answer is *invisible* — she just never
 * sees a recipe she could have cooked. These are the tests that make that visible.
 */

describe('parseQuantity', () => {
  it('reads the fraction glyphs a cookbook actually prints', () => {
    expect(parseQuantity('½')).toBe(0.5)
    expect(parseQuantity('1½')).toBe(1.5)
    expect(parseQuantity('2 ¾')).toBe(2.75)
    expect(parseQuantity('⅔')).toBeCloseTo(2 / 3)
  })

  it('reads typed fractions', () => {
    expect(parseQuantity('3/4')).toBe(0.75)
    expect(parseQuantity('1 1/2')).toBe(1.5)
  })

  it('takes the low end of a range — she can read the printed line for the rest', () => {
    expect(parseQuantity('2-3')).toBe(2)
    expect(parseQuantity('2 to 3')).toBe(2)
  })

  it('returns undefined rather than 0 when there is no number', () => {
    expect(parseQuantity('a pinch')).toBeUndefined()
    expect(parseQuantity('')).toBeUndefined()
  })
})

describe('normalize', () => {
  it('strips preparation words, which describe the cook not the ingredient', () => {
    expect(normalize('finely chopped flat-leaf parsley')).toBe('flat-leaf parsley')
    expect(normalize('freshly ground black pepper')).toBe('black pepper')
    expect(normalize('2 large free-range eggs')).toBe('free-range egg')
  })

  it('drops parentheticals and everything after the first comma', () => {
    expect(normalize('flour (190 g), sifted')).toBe('flour')
  })

  it('folds accents and case', () => {
    expect(normalize('Crème Fraîche')).toBe('creme fraiche')
    expect(fold('CAFÉ')).toBe('cafe')
  })

  it('singularizes, including the plurals a recipe uses', () => {
    expect(normalize('tomatoes')).toBe('tomato')
    expect(normalize('anchovies')).toBe('anchovy')
    expect(normalize('bay leaves')).toBe('bay leaf')
  })

  it('does NOT collapse things that are not the same thing', () => {
    // Conflating these is the bug that makes the dinner screen untrustworthy.
    expect(normalize('bell pepper')).not.toBe(normalize('pepper'))
    expect(normalize('sour cream')).not.toBe(normalize('cream'))
  })
})

describe('parseIngredientLine', () => {
  it('splits a printed line without ever losing the printed line', () => {
    const line = parseIngredientLine('1½ cups (190 g) all-purpose flour, sifted')
    expect(line.raw).toBe('1½ cups (190 g) all-purpose flour, sifted')
    expect(line.quantity).toBe(1.5)
    expect(line.unit).toBe('cup')
    expect(line.item).toBe('all-purpose flour')
    expect(line.canonical).toBe('all-purpose flour')
    expect(line.note).toBe('sifted')
  })

  it('handles a line with no quantity at all', () => {
    const line = parseIngredientLine('a pinch of saffron')
    expect(line.quantity).toBeUndefined()
    expect(line.canonical).toBe('saffron')
    expect(line.raw).toBe('a pinch of saffron')
  })

  it('does not mistake an ingredient that starts with a unit-like word', () => {
    const line = parseIngredientLine('2 cloves garlic')
    expect(line.quantity).toBe(2)
    expect(line.unit).toBe('clove')
    expect(line.canonical).toBe('garlic')
  })

  it('flags garnishes as optional so they never block a match', () => {
    expect(parseIngredientLine('parsley, to garnish').optional).toBe(true)
    expect(parseIngredientLine('1 tbsp capers (optional)').optional).toBe(true)
    expect(parseIngredientLine('2 onions').optional).toBeUndefined()
  })

  it('survives an empty line', () => {
    expect(parseIngredientLine('   ')).toEqual({ raw: '' })
  })
})

describe('formatUnit', () => {
  it('stores singular, displays the way she would say it', () => {
    expect(formatUnit('bulb', 2)).toBe('bulbs')
    expect(formatUnit('clove', 1)).toBe('clove')
    expect(formatUnit('loaf', 2)).toBe('loaves')
    expect(formatUnit('pinch', 2)).toBe('pinches')
  })

  it('never pluralizes an abbreviation', () => {
    expect(formatUnit('tbsp', 3)).toBe('tbsp')
    expect(formatUnit('g', 400)).toBe('g')
  })

  it('handles a missing unit or a missing quantity', () => {
    expect(formatUnit(undefined, 2)).toBe('')
    expect(formatUnit('cup', undefined)).toBe('cup')
  })
})

describe('canonicalNames', () => {
  it('dedupes across groups, in first-seen order', () => {
    const groups = [
      { heading: 'For the crust', items: [parseIngredientLine('2 cups flour'), parseIngredientLine('1 tsp salt')] },
      { heading: 'For the filling', items: [parseIngredientLine('3 tbsp flour'), parseIngredientLine('4 apples')] },
    ]
    expect(canonicalNames(groups)).toEqual(['flour', 'salt', 'apple'])
  })
})

describe('normalize: instruction tails', () => {
  it('drops "to taste" and friends so the ingredient is the ingredient', () => {
    expect(normalize('Salt to taste')).toBe('salt')
    expect(normalize('oil as needed')).toBe('oil')
    expect(normalize('chopped parsley if desired')).toBe('parsley')
    expect(normalize('lime wedges for serving')).toBe('lime wedge')
    // Word boundaries: "tomato served" must not lose its "to serve".
    expect(normalize('tomato served warm')).toBe('tomato served warm')
  })
})
