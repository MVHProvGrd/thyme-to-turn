import { describe, it, expect } from 'vitest'
import {
  canonicalNames,
  choiceNames,
  splitAlternatives,
  coversByPrefix,
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

describe('coversByPrefix — what a pantry entry actually covers', () => {
  it('covers a cut of the thing', () => {
    expect(coversByPrefix('chicken', 'chicken thigh')).toBe(true)
    expect(coversByPrefix('chicken', 'chicken breast fillet')).toBe(true)
    expect(coversByPrefix('beef', 'beef shin')).toBe(true)
  })

  it('does NOT cover a derived product — having a chicken is not having stock', () => {
    // Reported by Alisa 2026-08-16: marking chicken put a SHRIMP recipe at the top,
    // because the recipe used chicken stock.
    expect(coversByPrefix('chicken', 'chicken stock')).toBe(false)
    expect(coversByPrefix('chicken', 'chicken broth')).toBe(false)
    expect(coversByPrefix('chicken', 'chicken stock cube')).toBe(false)
    expect(coversByPrefix('chicken', 'chicken bouillon')).toBe(false)
    expect(coversByPrefix('beef', 'beef stock')).toBe(false)
    expect(coversByPrefix('garlic', 'garlic powder')).toBe(false)
    expect(coversByPrefix('onion', 'onion paste')).toBe(false)
    expect(coversByPrefix('olive', 'olive oil')).toBe(false)
    expect(coversByPrefix('coconut', 'coconut milk')).toBe(false)
    expect(coversByPrefix('peanut', 'peanut butter')).toBe(false)
    expect(coversByPrefix('rice', 'rice wine')).toBe(false)
    expect(coversByPrefix('almond', 'almond flour')).toBe(false)
  })

  it('still covers what she can make from the thing in her hand', () => {
    expect(coversByPrefix('lemon', 'lemon juice')).toBe(true)
    expect(coversByPrefix('lemon', 'lemon zest')).toBe(true)
    expect(coversByPrefix('orange', 'orange peel')).toBe(true)
  })

  it('keeps the original guards: the space, and not covering itself', () => {
    expect(coversByPrefix('chick', 'chicken')).toBe(false)
    expect(coversByPrefix('chicken', 'chickpea')).toBe(false)
    expect(coversByPrefix('chicken', 'chicken')).toBe(false)
  })

  it('fails OPEN on an unusual cut — a miss is the invisible failure', () => {
    expect(coversByPrefix('chicken', 'chicken maryland')).toBe(true)
    expect(coversByPrefix('pork', 'pork collar butt')).toBe(true)
  })
})

describe('normalize: adjectives before the ingredient', () => {
  // The head-of-the-comma rule is right for a note and wrong for a lead-in adjective.
  // "skinless, boneless chicken breast" used to normalise to NOTHING -- "skinless" is a
  // preparation, so the head emptied out and the chicken was thrown away with it. A recipe
  // like that could never match chicken, on the one screen the whole app is built around.
  it('keeps the ingredient when the commas come first', () => {
    expect(normalize('skinless, boneless chicken breast')).toBe('chicken breast')
    expect(normalize('boneless, skinless chicken thighs')).toBe('chicken thigh')
  })

  it('still treats a trailing comma as a note', () => {
    expect(normalize('flour, sifted')).toBe('flour')
    expect(normalize('1 large onion, finely chopped')).toBe('onion')
    expect(normalize('chicken, cooked and shredded')).toBe('chicken')
  })

  it('falls through several throwaway segments', () => {
    expect(normalize('fresh, ripe, large tomatoes')).toBe('tomato')
  })

  it('is still empty when there is genuinely no ingredient', () => {
    expect(normalize('finely chopped')).toBe('')
    expect(normalize('to taste')).toBe('')
  })
})

describe('parseIngredientLine: which comma-piece is the ingredient', () => {
  it('files the adjectives as the note and keeps the ingredient', () => {
    // It used to be exactly backwards: item "skinless", note "boneless chicken breasts".
    const parsed = parseIngredientLine('2 skinless, boneless chicken breasts')
    expect(parsed.item).toBe('boneless chicken breasts')
    expect(parsed.canonical).toBe('chicken breast')
    expect(parsed.quantity).toBe(2)
    // The printed line is untouched whatever we decide about the pieces.
    expect(parsed.raw).toBe('2 skinless, boneless chicken breasts')
  })

  it('still reads a plain trailing note the usual way', () => {
    const parsed = parseIngredientLine('1 cup flour, sifted')
    expect(parsed.item).toBe('flour')
    expect(parsed.note).toBe('sifted')
    expect(parsed.canonical).toBe('flour')
    expect(parsed.unit).toBe('cup')
  })

  it('keeps every other piece as the note', () => {
    const parsed = parseIngredientLine('500 g boneless, skinless chicken thighs, cut into chunks')
    expect(parsed.canonical).toBe('chicken thigh')
    expect(parsed.note).toBe('boneless, cut into chunks')
  })
})

/**
 * "minced or ground lamb or beef" is one requirement with two answers.
 *
 * Before this existed the line canonicalised to "lamb beef" and matched nothing at all —
 * the invisible failure: she would never see the recipe and never know why.
 */
describe('splitAlternatives', () => {
  it('reads the case that started this: two preparations, two animals, one choice', () => {
    // minced and ground are the same thing said on two continents, and both are already
    // preparation words — so what is left is the choice that actually matters.
    expect(splitAlternatives('minced or ground lamb or beef')).toEqual(['lamb', 'beef'])
  })

  it('reads a plain substitution', () => {
    expect(splitAlternatives('butter or margarine')).toEqual(['butter', 'margarine'])
    expect(splitAlternatives('either milk or cream')).toEqual(['milk', 'cream'])
  })

  it('treats a slash as the same offer with different punctuation', () => {
    expect(splitAlternatives('milk/cream')).toEqual(['milk', 'cream'])
  })

  it('leaves an ordinary line as a single name', () => {
    expect(splitAlternatives('all-purpose flour')).toEqual(['all-purpose flour'])
    expect(splitAlternatives('oregano')).toEqual(['oregano'])
  })

  it('does not split a word that merely contains "or"', () => {
    expect(splitAlternatives('orange zest')).toEqual(['orange zest'])
    expect(splitAlternatives('cornstarch')).toEqual(['cornstarch'])
  })

  it('drops a choice of preparation, which is not a choice of ingredient', () => {
    expect(splitAlternatives('chopped or sliced onions')).toEqual(['onion'])
  })

  it('never returns the same name twice', () => {
    expect(splitAlternatives('beef or ground beef')).toEqual(['beef'])
  })
})

describe('parseIngredientLine: lines that offer a choice', () => {
  it('puts the first option in canonical and the rest in alternatives', () => {
    const line = parseIngredientLine('500 g minced or ground lamb or beef')
    expect(line.raw).toBe('500 g minced or ground lamb or beef')
    expect(line.quantity).toBe(500)
    expect(line.unit).toBe('g')
    expect(line.canonical).toBe('lamb')
    expect(line.alternatives).toEqual(['beef'])
  })

  it('picks up an alternative that the page put after the comma', () => {
    const line = parseIngredientLine('1 cup flour, or cornstarch')
    expect(line.canonical).toBe('flour')
    expect(line.alternatives).toEqual(['cornstarch'])
    // The note keeps the printed wording either way.
    expect(line.note).toBe('or cornstarch')
  })

  it('leaves alternatives off an ordinary line rather than storing an empty list', () => {
    expect(parseIngredientLine('2 cups flour').alternatives).toBeUndefined()
  })
})

describe('choiceNames', () => {
  it('gives one entry per line, carrying every name that satisfies it', () => {
    const groups = [
      {
        items: [
          parseIngredientLine('1 onion'),
          parseIngredientLine('500 g minced or ground lamb or beef'),
        ],
      },
    ]
    expect(choiceNames(groups)).toEqual([['onion'], ['lamb', 'beef']])
    // The flat list still holds every name, because that is what the registry indexes.
    expect(canonicalNames(groups)).toEqual(['onion', 'lamb', 'beef'])
  })

  it('collapses two lines asking for the same thing', () => {
    const groups = [{ items: [parseIngredientLine('1 onion'), parseIngredientLine('2 onions')] }]
    expect(choiceNames(groups)).toEqual([['onion']])
  })

  it('derives from raw for rows written before alternatives existed', () => {
    const groups = [{ items: [{ raw: '500 g minced or ground lamb or beef' }] }]
    expect(choiceNames(groups)).toEqual([['lamb', 'beef']])
  })
})
