/**
 * The domain types. Pure — no Dexie, no React, no browser.
 *
 * These are the shapes in 03-DATA-MODEL.md. `db/schema.ts` declares the *indexes* over
 * them; this file is the single source of truth for the *shape*. Anything that needs to
 * know what a recipe is imports from here, including code that never touches storage.
 */

/** Every row we own has one of these, minted by us, immutable forever (D3). */
export type Uuid = string

export type PhotoRef = {
  uuid: Uuid
  kind: 'page' | 'dish' | 'other'
  /** Fractional 0–1. Page photos crop non-destructively; the pixels are evidence. */
  crop?: { x: number; y: number; w: number; h: number }
  width?: number
  height?: number
  bytes?: number
}

export type Ingredient = {
  /** EXACTLY as printed: "1½ cups (190 g) flour, sifted". Never lost, never rewritten. */
  raw: string
  quantity?: number
  unit?: string
  /** As written, minus the quantity: "all-purpose flour". */
  item?: string
  /** The matchable key: "flour". Derived — always reconstructible from `raw`. */
  canonical?: string
  note?: string
  /** Garnishes must not block pantry feasibility. */
  optional?: boolean
}

export type IngredientGroup = {
  /** "For the crust". Load-bearing: a merged list is a wrong recipe, not an untidy one. */
  heading?: string
  items: Ingredient[]
}

export type Step = {
  n: number
  text: string
}

export type RecipeSource = {
  kind: 'book' | 'magazine' | 'handwritten' | 'web' | 'other'
  /** → books.uuid, when kind === 'book'. Phase 3. */
  bookUuid?: Uuid
  pageStart?: number
  pageEnd?: number
  /** Free text until phase 3 gives it a real book to point at. */
  citation?: string
  url?: string
  /**
   * Set only on recipes that did not come from her own shelf — the starter set
   * ("CC BY-SA 4.0"), a public-domain cookbook ("public-domain"). Absent on hers. If
   * shared material is ever the thing she wants to share, the field that says so already
   * exists (05-SOURCES-AND-RIGHTS.md).
   */
  license?: string
}

export type Recipe = {
  uuid: Uuid
  createdAt: string
  updatedAt: string

  title: string
  subtitle?: string

  source: RecipeSource

  yield?: { text: string; servings?: number }
  times?: { prepMinutes?: number; cookMinutes?: number; totalMinutes?: number }

  ingredients: IngredientGroup[]
  steps: Step[]

  /** HERS. The parser must never write here. */
  notes?: string
  tags: string[]

  photos: PhotoRef[]

  /**
   * Deduped `ingredients` registry uuids, maintained by repo.ts on write. Backs the
   * *ingredientIndex multi-entry index and therefore the pantry search. Staples and
   * optionals are filtered at QUERY time, so flipping isStaple never needs a reindex.
   */
  ingredientIndex: Uuid[]

  parse?: {
    model: string
    schemaVersion: number
    parsedAt: string
    lowConfidenceFields: string[]
  }
  /** No third state. A human either looked at it or didn't. */
  verified: boolean
}

export type Book = {
  uuid: Uuid
  createdAt: string
  updatedAt: string

  title: string
  subtitle?: string
  authors: string[]
  publisher?: string
  publishedYear?: number
  edition?: string
  language?: string

  /** Outside identifiers live here and are labelled. They are never keys. */
  externalRefs: {
    isbn13?: string
    isbn10?: string
    openLibraryEdition?: string
    openLibraryWork?: string
  }

  cover?: PhotoRef
  shelfNote?: string
  lookedUpAt?: string
  source: 'openlibrary' | 'googlebooks' | 'manual'
}

/**
 * The ingredient registry — D3 applied one level below recipes. Recipes reference the
 * uuid, never the string, which is what makes "merge scallion into spring onion" a
 * bounded update rather than a rewrite of every recipe.
 */
export type IngredientEntry = {
  uuid: Uuid
  /** "scallion" — the display name, and the normalized match key. */
  canonical: string
  aliases: string[]
  /** Assumed present; replaces a separate staples list. */
  isStaple: boolean
  createdAt: string
  /** Recipes using it — sorts the merge UI by what's worth fixing. */
  seenCount: number
}

export type PhotoBlob = {
  uuid: Uuid
  blob: Blob
  mime: string
  createdAt: string
}

/**
 * Single-row settings. The API key is deliberately NOT here — it lives in local storage
 * (api/key.ts, phase 4) so it can never ride along in an export.
 */
export type Settings = {
  key: 'singleton'
  schemaVersion: number
  /** Last-used ad-hoc list, so the dinner screen isn't a blank slate (D12). */
  pantry: string[]
  /**
   * The category vocabulary — presets plus whatever she invents. Assignments live on
   * `Recipe.tags`, which has been indexed since v1, so categories needed no migration.
   * Optional and read with a `?? PRESET_CATEGORIES` default, so a settings row written
   * before this existed still works.
   */
  categories?: string[]
  lastExportAt?: string
  unitPreference?: 'metric' | 'imperial' | 'as-written'
}
