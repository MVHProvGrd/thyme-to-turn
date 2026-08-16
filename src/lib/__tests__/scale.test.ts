import { describe, it, expect } from 'vitest'
import { convertAmount, displayAmount, formatNumber, scaleAmount, scaleYield } from '../scale'
import { formatUnit } from '../ingredients'

const show = (q: number | undefined, u: string | undefined, opts: Record<string, unknown> = {}) =>
  displayAmount(q, u, { formatUnit, ...opts })

describe('formatNumber — a cook reads fractions', () => {
  it('uses the glyphs a cookbook prints', () => {
    expect(formatNumber(1.5)).toBe('1½')
    expect(formatNumber(0.5)).toBe('½')
    expect(formatNumber(2 / 3)).toBe('⅔')
    expect(formatNumber(0.25)).toBe('¼')
    expect(formatNumber(3)).toBe('3')
  })

  it('does not pretend to precision it has not got', () => {
    expect(formatNumber(237.5)).toBe('238') // millilitres, not 237.5
    expect(formatNumber(1.27)).toBe('1.27')
  })
})

describe('scaleAmount', () => {
  it('scales, and leaves an unmeasured line alone', () => {
    expect(scaleAmount(2, 2)).toBe(4)
    expect(scaleAmount(1.5, 0.5)).toBe(0.75)
    expect(scaleAmount(undefined, 2)).toBeUndefined()
  })
})

describe('convertAmount — volume to volume, weight to weight, never across', () => {
  it('takes imperial volume to metric', () => {
    expect(convertAmount(1, 'cup', 'metric')).toMatchObject({ unit: 'ml' })
    expect(Math.round(convertAmount(1, 'cup', 'metric').quantity)).toBe(237)
    expect(convertAmount(5, 'cup', 'metric').unit).toBe('l')
  })

  it('takes imperial weight to metric', () => {
    expect(Math.round(convertAmount(1, 'lb', 'metric').quantity)).toBe(454)
    expect(convertAmount(1, 'lb', 'metric').unit).toBe('g')
    expect(convertAmount(3, 'lb', 'metric').unit).toBe('kg')
  })

  it('takes metric back to imperial, picking a sane unit', () => {
    expect(convertAmount(240, 'ml', 'imperial').unit).toBe('cup')
    expect(convertAmount(15, 'ml', 'imperial').unit).toBe('tbsp')
    expect(convertAmount(5, 'ml', 'imperial').unit).toBe('tsp')
    expect(convertAmount(500, 'g', 'imperial').unit).toBe('lb')
    expect(convertAmount(50, 'g', 'imperial').unit).toBe('oz')
  })

  it('REFUSES to cross volume and weight — that needs a density it does not have', () => {
    // A cup of flour and a cup of water do not weigh the same.
    expect(convertAmount(1, 'cup', 'metric').unit).toBe('ml')
    expect(convertAmount(1, 'cup', 'metric').unit).not.toBe('g')
  })

  it('leaves a unit it cannot convert exactly as written', () => {
    for (const unit of ['bulb', 'clove', 'pinch', 'handful', 'sprig']) {
      expect(convertAmount(2, unit, 'metric'), unit).toEqual({ quantity: 2, unit })
    }
  })

  it('does nothing at all when she asked for as-written', () => {
    expect(convertAmount(1, 'cup', 'as-written')).toEqual({ quantity: 1, unit: 'cup' })
  })
})

describe('displayAmount — what the 88px column shows', () => {
  it('scales before converting, so doubling half a cup is one cup', () => {
    expect(show(0.5, 'cup', { factor: 2 })).toBe('1 cup')
    expect(show(1.5, 'cup', { factor: 2 })).toBe('3 cups')
    expect(show(3, 'cup', { factor: 0.5 })).toBe('1½ cups')
  })

  it('pluralises the way she would say it', () => {
    expect(show(2, 'bulb')).toBe('2 bulbs')
    expect(show(1, 'bulb')).toBe('1 bulb')
    expect(show(500, 'g')).toBe('500 g') // abbreviations never take an s
  })

  it('copes with a line that has no number', () => {
    expect(show(undefined, undefined)).toBe('')
    expect(show(undefined, 'pinch')).toBe('pinch')
  })

  it('scales and converts together', () => {
    expect(show(1, 'cup', { factor: 2, preference: 'metric' })).toBe('473 ml')
  })
})

describe('scaleYield', () => {
  it('moves the first number and leaves her words alone', () => {
    expect(scaleYield('Serves 4', 2)).toBe('Serves 8')
    expect(scaleYield('Serves 4-6', 2)).toBe('Serves 8-6') // only the first, deliberately
    expect(scaleYield('Makes 12 buns', 0.5)).toBe('Makes 6 buns')
  })

  it('leaves it alone at ×1, and when there is no number to move', () => {
    expect(scaleYield('Serves 4', 1)).toBe('Serves 4')
    expect(scaleYield('Plenty for a crowd', 2)).toBe('Plenty for a crowd')
    expect(scaleYield(undefined, 2)).toBeUndefined()
  })
})
