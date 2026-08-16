/**
 * Turning an AI parse into something the verification form can show. PURE — no API, no
 * database, no React, so the conversion that decides what she is asked to check is
 * testable without either.
 *
 * The rule this file exists to enforce: a parse is a SUGGESTION. Nothing here writes
 * anywhere, `raw` is carried through untouched, and every field the model flagged as
 * doubtful comes out marked so the form can point at it. `db/repo.ts` is still the only
 * writer and it is still only called when she presses Save.
 */

import { parseIngredientLine } from './ingredients'
import type { ParsedRecipe } from './types'

/** One editable ingredient row, the same shape the typed-in path uses. */
export type DraftLine = { quantity: string; item: string; raw: string; optional: boolean }

export type ParsedDraft = {
  title: string
  yieldText: string
  lines: DraftLine[]
  method: string
  /** Dotted paths the model was unsure of, normalized and deduped. */
  doubts: Set<string>
}

/**
 * The parse, as form fields.
 *
 * `raw` is kept verbatim and is what gets saved; `quantity`/`item` are only what the
 * inputs show. If the model's own split disagrees with our normalizer we keep the
 * model's, because it could see the page.
 */
export function draftFromParsed(parsed: ParsedRecipe): ParsedDraft {
  const lines: DraftLine[] = []
  for (const group of parsed.ingredients ?? []) {
    for (const item of group.items ?? []) {
      const raw = (item.raw ?? '').trim()
      if (!raw) continue
      const fallback = parseIngredientLine(raw)
      const quantity = [
        item.quantity ?? fallback.quantity ?? '',
        item.unit ?? fallback.unit ?? '',
      ]
        .filter((part) => part !== '' && part !== undefined)
        .join(' ')
        .trim()
      lines.push({
        raw,
        quantity,
        item: (item.item ?? fallback.item ?? raw).trim(),
        optional: Boolean(item.optional),
      })
    }
  }

  return {
    title: (parsed.title ?? '').trim(),
    yieldText: (parsed.yield ?? '').trim(),
    lines,
    method: (parsed.steps ?? []).map((step) => step.trim()).filter(Boolean).join('\n'),
    doubts: new Set((parsed.lowConfidenceFields ?? []).map((path) => path.trim()).filter(Boolean)),
  }
}

/**
 * Did the model flag this field? Matches a whole path or any parent of it, so a doubt
 * recorded as `ingredients.0` lights up `ingredients.0.quantity` too.
 */
export function isDoubted(doubts: Set<string>, path: string): boolean {
  if (doubts.has(path)) return true
  for (const doubt of doubts) {
    if (path.startsWith(`${doubt}.`)) return true
  }
  return false
}

/** "3 of 14 lines" — how much of this she is being asked to look at especially hard. */
export function countDoubts(draft: ParsedDraft): number {
  return draft.doubts.size
}

/**
 * Ingredient groups for saving. The form is a flat list of lines — headings from the page
 * are preserved on the parse but the phase-1 edit screen has never had a way to show them,
 * so they are carried into a single group rather than silently dropped into nothing.
 */
export function groupsFromLines(lines: DraftLine[]): { items: { raw: string; optional?: boolean }[] }[] {
  const items = lines
    .map((line) => ({ raw: line.raw.trim(), ...(line.optional ? { optional: true } : {}) }))
    .filter((item) => item.raw)
  return items.length ? [{ items }] : []
}
