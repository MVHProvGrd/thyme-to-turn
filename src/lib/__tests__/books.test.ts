import { describe, it, expect } from 'vitest'
import { bookCitation, bookFromOpenLibrary, yearFrom } from '../books'

/** Cut from the real Open Library answer for the Zuni Café Cookbook, 2026-08-16. */
const ZUNI = {
  'ISBN:9780393020434': {
    url: 'http://openlibrary.org/books/OL23056266M/The_Zuni_Café_Cookbook',
    key: '/books/OL23056266M',
    title: 'The Zuni Café Cookbook',
    subtitle: "A Compendium of Recipes and Cooking Lessons from San Francisco's Beloved Restaurant",
    authors: [{ url: 'http://openlibrary.org/authors/OL2684716A/Judy_Rodgers', name: 'Judy Rodgers' }],
    number_of_pages: 547,
    identifiers: { isbn_10: ['0393020436'], openlibrary: ['OL23056266M'], oclc: ['50079976'] },
    publishers: [{ name: 'W. W. Norton & Company' }],
    publish_date: '2002',
    works: null,
    cover: {
      small: 'https://covers.openlibrary.org/b/id/15127539-S.jpg',
      medium: 'https://covers.openlibrary.org/b/id/15127539-M.jpg',
      large: 'https://covers.openlibrary.org/b/id/15127539-L.jpg',
    },
    excerpts: [{ text: 'some prose we must not keep' }],
  },
}

describe('bookFromOpenLibrary', () => {
  it('keeps the facts — title, authors, publisher, year, identifiers, cover URL', () => {
    const facts = bookFromOpenLibrary('9780393020434', ZUNI)
    expect(facts).toEqual({
      title: 'The Zuni Café Cookbook',
      subtitle: "A Compendium of Recipes and Cooking Lessons from San Francisco's Beloved Restaurant",
      authors: ['Judy Rodgers'],
      publisher: 'W. W. Norton & Company',
      publishedYear: 2002,
      externalRefs: { isbn13: '9780393020434', isbn10: '0393020436', openLibraryEdition: 'OL23056266M' },
      source: 'openlibrary',
      coverUrl: 'https://covers.openlibrary.org/b/id/15127539-L.jpg',
      pages: 547,
    })
  })

  it('returns undefined on a miss ({}), on junk, and on a hit with no title', () => {
    expect(bookFromOpenLibrary('9780393020434', {})).toBeUndefined()
    expect(bookFromOpenLibrary('9780393020434', null)).toBeUndefined()
    expect(bookFromOpenLibrary('9780393020434', 'nope')).toBeUndefined()
    expect(bookFromOpenLibrary('9780393020434', { 'ISBN:9780393020434': { authors: [] } })).toBeUndefined()
  })

  it('copes with a sparse record — no authors, no cover, no publisher', () => {
    const facts = bookFromOpenLibrary('9780000000002', {
      'ISBN:9780000000002': { title: 'The three voices of poetry', publish_date: '1985', key: '/books/OL43684247M' },
    })
    expect(facts).toEqual({
      title: 'The three voices of poetry',
      authors: [],
      publishedYear: 1985,
      externalRefs: { isbn13: '9780000000002', openLibraryEdition: 'OL43684247M' },
      source: 'openlibrary',
    })
  })
})

describe('yearFrom', () => {
  it('finds a four-digit year in the ways Open Library writes dates', () => {
    expect(yearFrom('2002')).toBe(2002)
    expect(yearFrom('October 1, 2002')).toBe(2002)
    expect(yearFrom('1st ed. 1996')).toBe(1996)
    expect(yearFrom(undefined)).toBeUndefined()
    expect(yearFrom('n.d.')).toBeUndefined()
  })
})

describe('bookCitation', () => {
  it('is title · authors, and just the title when nobody is credited', () => {
    expect(bookCitation({ title: 'The Zuni Café Cookbook', authors: ['Judy Rodgers'] })).toBe(
      'The Zuni Café Cookbook · Judy Rodgers',
    )
    expect(bookCitation({ title: 'Simple', authors: ['Yotam Ottolenghi', 'Tara Wigley'] })).toBe(
      'Simple · Yotam Ottolenghi, Tara Wigley',
    )
    expect(bookCitation({ title: "Mum's folder", authors: [] })).toBe("Mum's folder")
  })
})
