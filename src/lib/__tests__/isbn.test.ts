import { describe, it, expect } from 'vitest'
import { isbn10to13, isValidIsbn13, normalizeIsbn, pickIsbn } from '../isbn'

/**
 * The single most common capture bug is a misread digit that silently creates a junk
 * book record. Ten lines of checksum, tested, is what stands between the scanner and that.
 */
describe('normalizeIsbn', () => {
  it('strips hyphens, spaces and an ISBN: prefix, uppercases the X', () => {
    expect(normalizeIsbn('978-0-393-02043-4')).toBe('9780393020434')
    expect(normalizeIsbn(' 978 0393 020434 ')).toBe('9780393020434')
    expect(normalizeIsbn('ISBN: 0-393-02043-6')).toBe('0393020436')
    expect(normalizeIsbn('039302043x')).toBe('039302043X')
  })
})

describe('isValidIsbn13', () => {
  it('accepts real ISBN-13s', () => {
    expect(isValidIsbn13('9780393020434')).toBe(true) // The Zuni Café Cookbook
    expect(isValidIsbn13('9780714847696')).toBe(true) // The Silver Spoon
    expect(isValidIsbn13('9791234567896')).toBe(true) // a 979
  })

  it('rejects a misread digit, a transposition, wrong length, and non-book EANs', () => {
    expect(isValidIsbn13('9780393020435')).toBe(false)
    expect(isValidIsbn13('9780393024034')).toBe(false)
    expect(isValidIsbn13('978039302043')).toBe(false)
    expect(isValidIsbn13('5012345678900')).toBe(false) // valid EAN, not 978/979 — not a book
    expect(isValidIsbn13('')).toBe(false)
    expect(isValidIsbn13('abc')).toBe(false)
  })
})

describe('isbn10to13', () => {
  it('converts a valid ISBN-10, including a trailing X', () => {
    expect(isbn10to13('0393020436')).toBe('9780393020434')
    expect(isbn10to13('0-306-40615-2')).toBe('9780306406157')
    expect(isbn10to13('080442957X')).toBe('9780804429573')
  })

  it('returns undefined for a bad ISBN-10', () => {
    expect(isbn10to13('0393020437')).toBeUndefined()
    expect(isbn10to13('12345')).toBeUndefined()
  })
})

describe('pickIsbn', () => {
  it('takes the 13-digit book code and ignores the price add-on and noise', () => {
    // A book back cover: the ISBN barcode plus a 5-digit price add-on, and a stray read.
    expect(pickIsbn(['51999', '9780393020434'])).toBe('9780393020434')
    expect(pickIsbn(['9780393020434', '9780393020434'])).toBe('9780393020434')
    expect(pickIsbn(['5012345678900', '9780393020434'])).toBe('9780393020434')
  })

  it('accepts a typed ISBN-10 by converting it', () => {
    expect(pickIsbn(['0-393-02043-6'])).toBe('9780393020434')
  })

  it('returns undefined when nothing is a valid ISBN', () => {
    expect(pickIsbn(['51999', '9780393020435'])).toBeUndefined()
    expect(pickIsbn([])).toBeUndefined()
  })
})
