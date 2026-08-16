import { describe, it, expect } from 'vitest'
import {
  MAX_CATEGORY_LENGTH,
  PRESET_CATEGORIES,
  addCategory,
  hasCategory,
  normalizeCategory,
  removeCategory,
  sameCategory,
  toggleCategory,
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
