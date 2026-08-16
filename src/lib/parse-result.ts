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

/**
 * The ingredient editor is a flat list of rows, and a heading is a row of its own.
 *
 * Groups are load-bearing, not decoration: a cook following a merged list creams the
 * filling's butter into the pastry. They survived the parse from the beginning but the
 * form had no way to show them, so they collapsed on save — this is what fixes that.
 *
 * `index` is the item's position in the ORIGINAL parse, so a doubt recorded as
 * `ingredients.1` still points at the right row once headings are interleaved.
 */
export type DraftRow =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; quantity: string; item: string; raw: string; optional: boolean; index: number }

export type ParsedDraft = {
  title: string
  yieldText: string
  lines: DraftLine[]
  rows: DraftRow[]
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
  const rows: DraftRow[] = []
  let index = 0
  for (const group of parsed.ingredients ?? []) {
    const heading = (group.heading ?? '').trim()
    if (heading && (group.items ?? []).some((item) => (item.raw ?? '').trim())) {
      rows.push({ kind: 'heading', text: heading })
    }
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
      const line: DraftLine = {
        raw,
        quantity,
        item: (item.item ?? fallback.item ?? raw).trim(),
        optional: Boolean(item.optional),
      }
      lines.push(line)
      rows.push({ kind: 'item', ...line, index })
      index += 1
    }
  }

  return {
    title: (parsed.title ?? '').trim(),
    yieldText: (parsed.yield ?? '').trim(),
    lines,
    rows,
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
 * Ingredient groups for saving, from the editor's flat rows. A heading starts a new group;
 * anything before the first heading is an unnamed one, which is how most pages read.
 * A heading with nothing under it is dropped rather than saved as an empty section.
 */
export function groupsFromRows(
  rows: DraftRow[],
): { heading?: string; items: { raw: string; optional?: boolean }[] }[] {
  const groups: { heading?: string; items: { raw: string; optional?: boolean }[] }[] = []
  let current: { heading?: string; items: { raw: string; optional?: boolean }[] } | null = null

  for (const row of rows) {
    if (row.kind === 'heading') {
      const heading = row.text.trim()
      current = heading ? { heading, items: [] } : { items: [] }
      groups.push(current)
      continue
    }
    const raw = row.raw.trim()
    if (!raw) continue
    if (!current) {
      current = { items: [] }
      groups.push(current)
    }
    current.items.push({ raw, ...(row.optional ? { optional: true } : {}) })
  }

  return groups.filter((group) => group.items.length > 0)
}

/** The flat-list version, kept for the typed-in path that has no headings. */
export function groupsFromLines(lines: DraftLine[]): { items: { raw: string; optional?: boolean }[] }[] {
  const items = lines
    .map((line) => ({ raw: line.raw.trim(), ...(line.optional ? { optional: true } : {}) }))
    .filter((item) => item.raw)
  return items.length ? [{ items }] : []
}
