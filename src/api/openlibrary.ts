/**
 * Open Library — the free, keyless ISBN lookup. The only file that talks to it.
 *
 * Open Library is a non-profit running on donations, so: ONE lookup per book, ever. The
 * answer lives in the local `books` table from then on (repo.ts caches it; nothing here
 * is called on render). Their published ask is a descriptive User-Agent with a contact
 * address — browsers forbid a page from setting that header, so the polite equivalent is
 * simply not hammering them, which the cache guarantees.
 *
 * Errors carry a plain sentence for the screen. Never "Oops".
 */

import { bookFromOpenLibrary } from '../lib/books'
import type { BookFacts } from '../lib/books'

const BASE = 'https://openlibrary.org/api/books'

export class LookupError extends Error {}

/** Facts for an ISBN-13, or undefined when Open Library has never heard of it. */
export async function lookupIsbn(isbn13: string): Promise<BookFacts | undefined> {
  const url = `${BASE}?bibkeys=ISBN:${encodeURIComponent(isbn13)}&format=json&jscmd=data`
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new LookupError("You're offline, or Open Library is unreachable. Type the title in for now.")
  }
  if (response.status === 429) throw new LookupError('Open Library is busy — wait a minute and scan again.')
  if (!response.ok) throw new LookupError(`Open Library answered ${response.status}. Type the title in for now.`)
  const json: unknown = await response.json()
  return bookFromOpenLibrary(isbn13, json)
}

/**
 * The cover image bytes, downloaded once so the shelf works offline and nothing is
 * hot-linked. `?default=false` makes a missing cover a 404 rather than a placeholder gif.
 * A failure here is not an error worth showing — a book without a cover is still a book.
 */
export async function fetchCover(coverUrl: string): Promise<Blob | undefined> {
  try {
    const url = coverUrl.includes('?') ? coverUrl : `${coverUrl}?default=false`
    const response = await fetch(url)
    if (!response.ok) return undefined
    const blob = await response.blob()
    return blob.size > 0 && blob.type.startsWith('image/') ? blob : undefined
  } catch {
    return undefined
  }
}
