/**
 * Turning an Open Library answer into the facts we keep about a book. PURE — the network
 * call lives in api/openlibrary.ts; this file only knows the shape of the JSON and which
 * parts of it are ours to store (title, authors, publisher, year — facts, not prose).
 */

import type { Book } from './types'

/** The bits of `jscmd=data` we read. Everything else on the response is ignored. */
export type OpenLibraryData = {
  title?: string
  subtitle?: string
  authors?: { name?: string }[]
  publishers?: { name?: string }[]
  publish_date?: string
  number_of_pages?: number
  key?: string
  identifiers?: { isbn_10?: string[]; isbn_13?: string[]; openlibrary?: string[] }
  works?: { key?: string }[] | null
  cover?: { small?: string; medium?: string; large?: string }
}

/** What a lookup yields before it becomes a Book: the facts plus where the cover is. */
export type BookFacts = Pick<
  Book,
  'title' | 'subtitle' | 'authors' | 'publisher' | 'publishedYear' | 'externalRefs' | 'source'
> & { coverUrl?: string; pages?: number }

/**
 * `GET /api/books?bibkeys=ISBN:<isbn13>&format=json&jscmd=data` returns `{ "ISBN:…": {…} }`
 * on a hit and `{}` on a miss. Undefined means "not found" — the caller then makes an
 * editable book with the ISBN filled in, never a dead end (D8).
 */
export function bookFromOpenLibrary(isbn13: string, response: unknown): BookFacts | undefined {
  if (!response || typeof response !== 'object') return undefined
  const data = (response as Record<string, OpenLibraryData | undefined>)[`ISBN:${isbn13}`]
  if (!data || typeof data !== 'object' || !data.title) return undefined

  const authors = (data.authors ?? []).map((a) => a.name?.trim()).filter((n): n is string => Boolean(n))
  const publisher = data.publishers?.[0]?.name?.trim()
  const publishedYear = yearFrom(data.publish_date)
  const edition = data.identifiers?.openlibrary?.[0] ?? data.key?.replace(/^\/books\//, '')
  const work = data.works?.[0]?.key?.replace(/^\/works\//, '')

  return {
    title: data.title.trim(),
    ...(data.subtitle?.trim() ? { subtitle: data.subtitle.trim() } : {}),
    authors,
    ...(publisher ? { publisher } : {}),
    ...(publishedYear ? { publishedYear } : {}),
    externalRefs: {
      isbn13,
      ...(data.identifiers?.isbn_10?.[0] ? { isbn10: data.identifiers.isbn_10[0] } : {}),
      ...(edition ? { openLibraryEdition: edition } : {}),
      ...(work ? { openLibraryWork: work } : {}),
    },
    source: 'openlibrary',
    ...(data.cover?.medium ? { coverUrl: data.cover.large ?? data.cover.medium } : {}),
    ...(typeof data.number_of_pages === 'number' ? { pages: data.number_of_pages } : {}),
  }
}

/** "2002" · "October 1, 2002" · "1st ed. 1996" → the four-digit year, or nothing. */
export function yearFrom(text: string | undefined): number | undefined {
  const m = text?.match(/\b(1[5-9]\d\d|20\d\d)\b/)
  return m ? Number(m[1]) : undefined
}

/**
 * "The Zuni Café Cookbook · Judy Rodgers" — the citation the source line prints. Kept
 * here so the recipe card, the detail page and the book page all say it the same way.
 */
export function bookCitation(book: Pick<Book, 'title' | 'authors'>): string {
  return [book.title, book.authors.join(', ')].filter(Boolean).join(' · ')
}
