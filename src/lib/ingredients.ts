/**
 * Turning "1½ cups (190 g) all-purpose flour, sifted" into something matchable.
 *
 * PURE. No Dexie, no React. The alias DATA lives in the db registry (09-PANTRY-SEARCH.md);
 * this file only knows how to *derive* a canonical string from a printed one.
 *
 * Everything here is reconstructible from `raw`, which is the point: improving the
 * normalizer is a backfill migration, never a re-parse, and never a call to the API.
 */

import type { Ingredient } from './types'

/** Unicode fraction glyphs a cookbook actually prints. */
const VULGAR: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

const UNITS: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', gr: 'g',
  kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  oz: 'oz', ounce: 'oz', ounces: 'oz',
  lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tbs: 'tbsp',
  cup: 'cup', cups: 'cup',
  pint: 'pint', pints: 'pint',
  quart: 'quart', quarts: 'quart',
  clove: 'clove', cloves: 'clove',
  sprig: 'sprig', sprigs: 'sprig',
  bunch: 'bunch', bunches: 'bunch',
  slice: 'slice', slices: 'slice',
  can: 'can', cans: 'can', tin: 'can', tins: 'can',
  pinch: 'pinch', pinches: 'pinch',
  handful: 'handful', handfuls: 'handful',
  stick: 'stick', sticks: 'stick',
  head: 'head', heads: 'head',
  piece: 'piece', pieces: 'piece',
  // Container and measure words a cookbook uses instead of a number. Without these,
  // "2 bulbs fennel" canonicalizes to "bulb fennel" and never matches "fennel".
  bulb: 'bulb', bulbs: 'bulb',
  stalk: 'stalk', stalks: 'stalk',
  knob: 'knob', knobs: 'knob',
  dash: 'dash', dashes: 'dash',
  splash: 'splash', splashes: 'splash',
  glug: 'glug', glugs: 'glug',
  drizzle: 'drizzle',
  jar: 'jar', jars: 'jar',
  packet: 'packet', packets: 'packet',
  bag: 'bag', bags: 'bag',
  sheet: 'sheet', sheets: 'sheet',
  rasher: 'rasher', rashers: 'rasher',
  strip: 'strip', strips: 'strip',
  loaf: 'loaf', loaves: 'loaf',
}

/** Units that are abbreviations, and so never take an "s" however many there are. */
const ABBREVIATED = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb', 'tsp', 'tbsp'])

/**
 * Units are stored singular so they match; they are *displayed* the way she'd say them.
 * "2 bulbs fennel", not "2 bulb fennel" — and never "2 tbsps".
 */
export function formatUnit(unit: string | undefined, quantity: number | undefined): string {
  if (!unit) return ''
  if (quantity === undefined || quantity <= 1 || ABBREVIATED.has(unit)) return unit
  if (unit === 'loaf') return 'loaves'
  if (unit === 'pinch' || unit === 'dash' || unit === 'splash') return `${unit}es`
  return `${unit}s`
}

/**
 * Words that describe *how it was prepared*, not *what it is*. Stripped for the canonical
 * key only — `raw` and `item` keep every one of them.
 */
const PREPARATIONS = new Set([
  'chopped', 'finely', 'roughly', 'coarsely', 'thinly', 'thickly', 'freshly', 'fresh',
  'dried', 'ground', 'grated', 'sliced', 'diced', 'minced', 'crushed', 'peeled', 'seeded',
  'pitted', 'trimmed', 'rinsed', 'drained', 'sifted', 'melted', 'softened', 'chilled',
  'room', 'temperature', 'large', 'small', 'medium', 'good', 'quality', 'ripe', 'plus',
  'more', 'extra', 'about', 'approximately', 'or', 'and', 'a', 'an', 'the', 'of', 'to',
  'for', 'into', 'well', 'lightly', 'very', 'plenty', 'few', 'some', 'preferably',
  'roasted', 'toasted', 'cooked', 'raw', 'whole', 'halved', 'quartered', 'cut', 'torn',
  'shredded', 'julienned', 'washed', 'scrubbed', 'stemmed', 'boneless', 'skinless',
])

/** Irregular plurals worth getting right; the rest fall to the -s/-es rules below. */
const IRREGULAR_SINGULAR: Record<string, string> = {
  leaves: 'leaf',
  loaves: 'loaf',
  knives: 'knife',
  halves: 'half',
  potatoes: 'potato',
  tomatoes: 'tomato',
  anchovies: 'anchovy',
  berries: 'berry',
  cherries: 'cherry',
  chillies: 'chilli',
}

function singular(word: string): string {
  if (IRREGULAR_SINGULAR[word]) return IRREGULAR_SINGULAR[word]
  if (word.length <= 3) return word
  if (/(ss|us|is|as)$/.test(word)) return word
  if (/ies$/.test(word)) return word.slice(0, -3) + 'y'
  if (/(ches|shes|xes|zes|ses)$/.test(word)) return word.slice(0, -2)
  if (/s$/.test(word)) return word.slice(0, -1)
  return word
}

/** Fold accents, lowercase, collapse whitespace. The first step of every comparison. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The matchable key for an ingredient name.
 *
 * "Finely chopped flat-leaf parsley" → "flat-leaf parsley"
 * "2 large free-range eggs"          → "egg"
 *
 * Deliberately conservative: it strips preparation words and singularizes, and does NOT
 * try to be clever about categories. "bell pepper" stays "bell pepper" — it is not
 * "pepper", and conflating them is exactly the bug that makes the dinner screen lie.
 */
export function normalize(name: string): string {
  const base = fold(name)
    // Drop anything parenthesised — it's almost always a metric conversion or an aside.
    .replace(/\([^)]*\)/g, ' ')
    // Everything after the first comma is a note: "flour, sifted".
    .split(',')[0]
    // "salt to taste", "oil as needed", "parsley if desired" — the tail is an instruction,
    // not part of the name. Without this "salt to taste" becomes the ingredient "salt taste".
    .replace(/\b(to taste|as needed|as required|if desired|for serving|for garnish|to serve|to garnish)\b.*$/, ' ')
    .replace(/[^a-z0-9 '-]/g, ' ')

  const words = base
    .split(' ')
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !/^\d+$/.test(w))
    .filter((w) => !(w in UNITS))
    .filter((w) => !PREPARATIONS.has(w))
    .map(singular)

  return words.join(' ').trim()
}

/** "1½" → 1.5 · "1 1/2" → 1.5 · "2-3" → 2 (the low end; she can read the raw line). */
export function parseQuantity(text: string): number | undefined {
  const t = fold(text)
  let total = 0
  let sawAny = false

  // "1 1/2", "3/4"
  const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])

  const fraction = t.match(/^(\d+)\s*\/\s*(\d+)/)
  if (fraction) return Number(fraction[1]) / Number(fraction[2])

  // "1½", "½", "2 ½"
  const leading = t.match(/^(\d+)?\s*([¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/)
  if (leading) {
    if (leading[1]) total += Number(leading[1])
    total += VULGAR[leading[2]]
    return total
  }

  // "2-3", "2 to 3" → the low end
  const range = t.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*\d/)
  if (range) return Number(range[1])

  const plain = t.match(/^(\d+(?:\.\d+)?)/)
  if (plain) {
    total = Number(plain[1])
    sawAny = true
  }
  return sawAny ? total : undefined
}

/**
 * Split a printed ingredient line into its parts. Best-effort by design: every field it
 * produces is a convenience layered on `raw`, and every view falls back to `raw` when a
 * field is missing. Getting this wrong is a cosmetic bug; losing `raw` would not be.
 */
export function parseIngredientLine(raw: string): Ingredient {
  const trimmed = raw.trim()
  if (!trimmed) return { raw: '' }

  const optional = /\boptional\b/i.test(trimmed) || /\bto (serve|garnish|taste)\b/i.test(trimmed)

  // Peel the quantity off the front, then a unit if the next word is one.
  const qtyMatch = trimmed.match(
    /^\s*(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?\s*(?:-|–|to)\s*\d+(?:\.\d+)?|\d*\s*[¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\d+(?:\.\d+)?)\s*/,
  )
  const quantity = qtyMatch ? parseQuantity(qtyMatch[1]) : undefined
  let rest = qtyMatch ? trimmed.slice(qtyMatch[0].length) : trimmed

  let unit: string | undefined
  const unitMatch = rest.match(/^([a-zA-Z]+)\.?\s+/)
  if (unitMatch) {
    const candidate = UNITS[fold(unitMatch[1])]
    if (candidate) {
      unit = candidate
      rest = rest.slice(unitMatch[0].length)
    }
  }

  const commaIndex = rest.indexOf(',')
  // Parentheticals are almost always a metric conversion; `raw` still has them, so the
  // displayed line stays clean and nothing is lost.
  const item = (commaIndex >= 0 ? rest.slice(0, commaIndex) : rest)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const note = commaIndex >= 0 ? rest.slice(commaIndex + 1).trim() : undefined

  const canonical = normalize(item || rest)

  return {
    raw: trimmed,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    ...(item ? { item } : {}),
    ...(canonical ? { canonical } : {}),
    ...(note ? { note } : {}),
    ...(optional ? { optional: true } : {}),
  }
}

/** Every canonical name in a recipe's ingredient groups, deduped, in first-seen order. */
export function canonicalNames(groups: { items: Ingredient[] }[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    for (const ingredient of group.items) {
      const key = ingredient.canonical ?? normalize(ingredient.item ?? ingredient.raw)
      if (key && !seen.has(key)) {
        seen.add(key)
        out.push(key)
      }
    }
  }
  return out
}

/**
 * Words that turn a thing into a DIFFERENT thing you buy separately.
 *
 * The prefix convention says a pantry `chicken` covers `chicken thigh`, which is right —
 * a thigh is a cut of chicken. It also made `chicken` cover `chicken stock`, which is
 * wrong, and put a shrimp recipe in front of Alisa because it used stock (2026-08-16).
 * Having a chicken is not having chicken stock; they are separate things on a shelf.
 *
 * Deliberately a BLOCK list rather than an allow-list of cuts. Anything unlisted still
 * matches, so an unusual cut ("chicken maryland", "beef shin") is found rather than
 * silently missed — and a miss is the invisible failure this whole area guards against.
 *
 * Things she CAN make from the base ingredient are deliberately absent: `lemon juice`,
 * `lemon zest` and `orange peel` should still match a pantry `lemon` or `orange`.
 */
const DERIVED_PRODUCTS = new Set([
  'stock', 'broth', 'bouillon', 'consomme', 'cube', 'cubes',
  'powder', 'granule', 'granules', 'extract', 'essence', 'concentrate', 'seasoning',
  'sauce', 'paste', 'puree', 'ketchup', 'mustard', 'mayonnaise', 'gravy',
  'oil', 'vinegar', 'wine', 'liqueur', 'syrup',
  'flour', 'milk', 'cream', 'butter',
  'jam', 'jelly', 'marmalade', 'preserve', 'preserves',
])

/**
 * Does a pantry entry named `general` cover a recipe ingredient named `specific`?
 *
 * The trailing space is the original guard — `chick` must never match `chicken`. The
 * derived-product check is the second one: `chicken` covers `chicken thigh` but not
 * `chicken stock`.
 */
export function coversByPrefix(general: string, specific: string): boolean {
  if (!specific.startsWith(general + ' ')) return false
  const rest = specific.slice(general.length + 1).trim()
  if (!rest) return false
  return !rest.split(' ').some((word) => DERIVED_PRODUCTS.has(word))
}

/**
 * Seeded true on things nobody runs out of; deliberately false on garlic, onion, egg,
 * milk and lemon, because people genuinely do. Used once, when the registry first
 * mints an entry — after that the flag is hers to change.
 */
export const SEEDED_STAPLES = [
  'salt',
  'kosher salt',
  'sea salt',
  'pepper',
  'black pepper',
  'ground black pepper',
  'freshly-ground black pepper',
  'water',
  'oil',
  'olive oil',
  'extra-virgin olive oil',
  'virgin olive oil', // "extra virgin olive oil" once `extra` is stripped as a preparation word
  'vegetable oil',
  'butter',
  'flour',
  'all-purpose flour',
  'sugar',
]
