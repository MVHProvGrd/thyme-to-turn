import { describe, it, expect } from 'vitest'
import {
  MAX_CATEGORY_LENGTH,
  PRESET_CATEGORIES,
  addCategory,
  filterByLabels,
  hasCategory,
  labelFilterIsEmpty,
  normalizeCategory,
  removeCategory,
  sameCategory,
  toggleCategory,
  unlistedLabels,
  vocabularyInUse,
} from '../categories'

describe('normalizeCategory', () => {
  it('trims and collapses whitespace, and keeps her capitalisation', () => {
    expect(normalizeCategory('  Sunday   lunch ')).toBe('Sunday lunch')
    expect(normalizeCategory('soup')).toBe('soup')
    expect(normalizeCategory("Alisa's mum's")).toBe("Alisa's mum's")
  })

  it('is empty for empty input, so a stray Enter adds nothing', () => {
    expect(normalizeCategory('   ')).toBe('')
    expect(normalizeCategory('')).toBe('')
  })

  it('caps the length — a chip that long helps nobody', () => {
    const long = 'a'.repeat(MAX_CATEGORY_LENGTH + 20)
    expect(normalizeCategory(long)).toHaveLength(MAX_CATEGORY_LENGTH)
  })
})

describe('sameCategory', () => {
  it('ignores case and accents', () => {
    expect(sameCategory('Soup', 'soup')).toBe(true)
    expect(sameCategory('Sauté', 'saute')).toBe(true)
    expect(sameCategory('Soup', 'Soups')).toBe(false)
  })
})

describe('addCategory', () => {
  it('appends, keeping the order she built', () => {
    expect(addCategory(['Breakfast'], 'Soup')).toEqual(['Breakfast', 'Soup'])
  })

  it('will not add the same category twice, however she capitalises it', () => {
    const list = ['Soup']
    expect(addCategory(list, 'soup')).toBe(list)
    expect(addCategory(list, '  SOUP ')).toBe(list)
  })

  it('ignores empty input', () => {
    const list = ['Soup']
    expect(addCategory(list, '   ')).toBe(list)
  })
})

describe('removeCategory', () => {
  it('removes case-insensitively and leaves the rest alone', () => {
    expect(removeCategory(['Breakfast', 'Soup', 'Dinner'], 'soup')).toEqual(['Breakfast', 'Dinner'])
    expect(removeCategory(['Breakfast'], 'Nope')).toEqual(['Breakfast'])
  })
})

describe('toggleCategory — assigning one to a recipe', () => {
  it('adds when absent and removes when present', () => {
    expect(toggleCategory([], 'Soup')).toEqual(['Soup'])
    expect(toggleCategory(['Soup'], 'Soup')).toEqual([])
    expect(toggleCategory(['Soup', 'Dinner'], 'soup')).toEqual(['Dinner'])
  })

  it('leaves other tags untouched — tags are not only categories', () => {
    expect(toggleCategory(['weeknight'], 'Soup')).toEqual(['weeknight', 'Soup'])
  })
})

describe('hasCategory', () => {
  it('is how a recipe answers "are you a soup?"', () => {
    expect(hasCategory(['Soup', 'Dinner'], 'soup')).toBe(true)
    expect(hasCategory(['Dinner'], 'soup')).toBe(false)
    expect(hasCategory([], 'soup')).toBe(false)
  })
})

describe('the presets', () => {
  it('are unique, non-empty and already normalized', () => {
    expect(new Set(PRESET_CATEGORIES.map((c) => c.toLowerCase())).size).toBe(PRESET_CATEGORIES.length)
    for (const preset of PRESET_CATEGORIES) expect(normalizeCategory(preset)).toBe(preset)
  })

  it('cover the meal times she named, plus kinds of dish', () => {
    for (const expected of ['Breakfast', 'Lunch', 'Dinner', 'Soup', 'Dessert']) {
      expect(PRESET_CATEGORIES).toContain(expected)
    }
  })
})

/**
 * Two vocabularies over one field. Categories say what KIND of meal it is, tags say what
 * it is LIKE, and both land in `recipe.tags` — so the tests that matter are the ones that
 * keep them from bleeding into each other's menus.
 */
const recipe = (...tags: string[]) => ({ tags })

const WEEKNIGHT = recipe('Dinner', 'Easy', 'Kid approved')
const SUNDAY = recipe('Dinner', 'Family favorite')
const PUDDING = recipe('Dessert', 'Easy')
const PLAIN = recipe()
const ALL = [WEEKNIGHT, SUNDAY, PUDDING, PLAIN]

const CATEGORIES = ['Breakfast', 'Dinner', 'Dessert']
const TAGS = ['Easy', 'Kid approved', 'Family favorite', 'Quick']

describe('filterByLabels', () => {
  it('returns everything when nothing is picked', () => {
    expect(filterByLabels(ALL, {})).toEqual(ALL)
    expect(filterByLabels(ALL, { category: null, tags: [] })).toEqual(ALL)
    expect(labelFilterIsEmpty({ category: null, tags: [] })).toBe(true)
  })

  it('narrows by one category', () => {
    expect(filterByLabels(ALL, { category: 'Dinner' })).toEqual([WEEKNIGHT, SUNDAY])
  })

  it('ANDs the tags — two picked means both, not either', () => {
    expect(filterByLabels(ALL, { tags: ['Easy'] })).toEqual([WEEKNIGHT, PUDDING])
    expect(filterByLabels(ALL, { tags: ['Easy', 'Kid approved'] })).toEqual([WEEKNIGHT])
  })

  it('adding a tag can only narrow, never widen', () => {
    const one = filterByLabels(ALL, { tags: ['Easy'] })
    const two = filterByLabels(ALL, { tags: ['Easy', 'Family favorite'] })
    expect(two.length).toBeLessThanOrEqual(one.length)
  })

  it('combines a category with tags', () => {
    expect(filterByLabels(ALL, { category: 'Dinner', tags: ['Easy'] })).toEqual([WEEKNIGHT])
    expect(filterByLabels(ALL, { category: 'Dessert', tags: ['Kid approved'] })).toEqual([])
  })

  it('ignores case, the way every other label comparison does', () => {
    expect(filterByLabels(ALL, { category: 'dinner' })).toEqual([WEEKNIGHT, SUNDAY])
    expect(filterByLabels(ALL, { tags: ['EASY'] })).toEqual([WEEKNIGHT, PUDDING])
  })
})

describe('vocabularyInUse', () => {
  it('offers only labels something actually carries', () => {
    // Breakfast is in the vocabulary but on no recipe: offering it is a guaranteed nothing.
    expect(vocabularyInUse(ALL, CATEGORIES)).toEqual(['Dinner', 'Dessert'])
    expect(vocabularyInUse(ALL, TAGS)).toEqual(['Easy', 'Kid approved', 'Family favorite'])
  })

  it('keeps the vocabulary order, not the order recipes happen to be in', () => {
    expect(vocabularyInUse([PUDDING, WEEKNIGHT], CATEGORIES)).toEqual(['Dinner', 'Dessert'])
  })

  it('never puts a tag in the category list, or the other way round', () => {
    expect(vocabularyInUse(ALL, CATEGORIES)).not.toContain('Easy')
    expect(vocabularyInUse(ALL, TAGS)).not.toContain('Dinner')
  })
})

describe('unlistedLabels', () => {
  it('finds what is left after a label is removed from its list', () => {
    // She deleted "Dessert" from Categories; the pudding still says Dessert.
    expect(unlistedLabels(ALL, ['Breakfast', 'Dinner'], TAGS)).toEqual(['Dessert'])
  })

  it('is empty when every label belongs to a vocabulary', () => {
    expect(unlistedLabels(ALL, CATEGORIES, TAGS)).toEqual([])
  })

  it('does not report a tag as unlisted just because it is not a category', () => {
    expect(unlistedLabels(ALL, CATEGORIES, TAGS)).not.toContain('Easy')
  })
})

describe('the two vocabularies stay apart', () => {
  it('a name in one list is not offered by the other, whatever the case', () => {
    const cats = ['Dinner']
    const tags = ['dinner party']
    expect(vocabularyInUse([recipe('Dinner')], tags)).toEqual([])
    expect(vocabularyInUse([recipe('dinner party')], cats)).toEqual([])
  })
})
