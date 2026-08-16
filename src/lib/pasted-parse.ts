/**
 * Reading a recipe that some OTHER AI produced. PURE.
 *
 * The bring-your-own-AI path: she opens whichever assistant she already pays for, gives it
 * her photo and the instructions this app hands her, and pastes the answer back. No API
 * key, no per-recipe cost, works with a tool she already trusts — and it lands in exactly
 * the same verification gate as the built-in parse, so nothing is written until she says so.
 *
 * FORGIVING ON PURPOSE. A chat assistant wraps JSON in code fences, apologises before it,
 * explains after it, and disagrees with itself about whether steps are called `steps`,
 * `method` or `instructions`. None of that is her problem to fix by hand, so this reads
 * around it. What it will NOT do is invent: a field it cannot find comes back null, which
 * is exactly what the gate is there to let her correct.
 */

import type { ParsedRecipe } from './types'

export class PastedParseError extends Error {}

/** Pull the JSON object out of whatever got pasted — fences, preamble, sign-off and all. */
export function extractJson(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new PastedParseError('Nothing was pasted.')

  // ```json … ``` or plain ``` … ```
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = fenced ? fenced[1].trim() : trimmed

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new PastedParseError("That doesn't look like a recipe in JSON. Copy the whole reply.")
  }
  return body.slice(start, end + 1)
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const n = Number(value.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && value.trim() !== '' ? n : null
  }
  return null
}

/** Steps as an array of strings, an array of objects, or one blob with newlines. */
function readSteps(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
      .filter(Boolean)
  }
  if (!Array.isArray(value)) return []
  return value
    .map((step) => {
      if (typeof step === 'string') return step.trim()
      const record = step as Record<string, unknown>
      return asString(record?.text ?? record?.step ?? record?.instruction) ?? ''
    })
    .map((text) => text.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
}

function readItem(value: unknown): ParsedRecipe['ingredients'][number]['items'][number] | null {
  if (typeof value === 'string') {
    const raw = value.trim()
    return raw
      ? { raw, quantity: null, unit: null, item: null, canonical: null, note: null, optional: false }
      : null
  }
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const raw = asString(record.raw ?? record.text ?? record.line ?? record.ingredient ?? record.name)
  if (!raw) return null
  return {
    raw,
    quantity: asNumber(record.quantity ?? record.amount),
    unit: asString(record.unit ?? record.units),
    item: asString(record.item ?? record.name ?? record.ingredient),
    canonical: asString(record.canonical),
    note: asString(record.note ?? record.notes),
    optional: record.optional === true,
  }
}

/** Groups, or a flat list, or a flat list of strings — all end up as groups. */
function readIngredients(value: unknown): ParsedRecipe['ingredients'] {
  if (!Array.isArray(value)) return []
  const looksGrouped = value.some(
    (entry) => entry && typeof entry === 'object' && Array.isArray((entry as Record<string, unknown>).items),
  )

  if (looksGrouped) {
    return value
      .map((entry) => {
        const record = (entry ?? {}) as Record<string, unknown>
        const items = (Array.isArray(record.items) ? record.items : [])
          .map(readItem)
          .filter((item): item is NonNullable<typeof item> => item !== null)
        return { heading: asString(record.heading ?? record.group ?? record.title), items }
      })
      .filter((group) => group.items.length > 0)
  }

  const items = value.map(readItem).filter((item): item is NonNullable<typeof item> => item !== null)
  return items.length ? [{ heading: null, items }] : []
}

/**
 * Whatever she pasted, as the shape the verification gate wants. Throws only when there is
 * genuinely nothing usable — a recipe with no ingredients AND no steps is a failed paste,
 * not a recipe she should be asked to correct field by field.
 */
export function readPastedParse(text: string): ParsedRecipe {
  let parsed: unknown
  try {
    parsed = JSON.parse(extractJson(text))
  } catch (caught) {
    if (caught instanceof PastedParseError) throw caught
    throw new PastedParseError("That JSON didn't read cleanly. Copy the whole reply and try again.")
  }

  const record = (parsed ?? {}) as Record<string, unknown>
  const ingredients = readIngredients(record.ingredients)
  const steps = readSteps(record.steps ?? record.method ?? record.instructions ?? record.directions)

  if (record.notARecipe === true) {
    throw new PastedParseError("That reply says the page isn't a recipe.")
  }
  if (ingredients.length === 0 && steps.length === 0) {
    throw new PastedParseError('No ingredients or steps in there. Copy the whole reply.')
  }

  const times = (record.times ?? null) as Record<string, unknown> | null
  return {
    notARecipe: false,
    title: asString(record.title ?? record.name),
    yield: asString(record.yield ?? record.servings ?? record.serves),
    times: times
      ? {
          prepMinutes: asNumber(times.prepMinutes ?? times.prep),
          cookMinutes: asNumber(times.cookMinutes ?? times.cook),
          totalMinutes: asNumber(times.totalMinutes ?? times.total),
        }
      : null,
    ingredients,
    steps,
    lowConfidenceFields: Array.isArray(record.lowConfidenceFields)
      ? record.lowConfidenceFields.filter((path): path is string => typeof path === 'string')
      : [],
  }
}
