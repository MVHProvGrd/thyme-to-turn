/**
 * The point of the app: "what can I make tonight?"
 *
 * PURE. No React, no Dexie, no window. The registry is data passed in, not a dependency,
 * which is what lets the feature where a wrong answer is invisible be tested to death
 * without a browser (see __tests__/pantry.test.ts).
 *
 * Two filters, both live at once — there is no mode toggle. Every ingredient is in one of
 * three states, and `unknown` genuinely means unknown:
 *
 *   dontHave  she said she's out of it     → reliable AND complete   → `missing` (hard)
 *   have      she said she has it          → reliable but incomplete → confirmed
 *   unknown   she never mentioned it       → not a fact either way   → `notSure` (soft)
 *
 * The marks are not symmetric and that asymmetry is the whole design. One number cannot
 * carry both, so every match has two: `missing` and `notSure`. The regression test that
 * matters: a `have` mark must never increase any recipe's `missing` count.
 *
 * `notSure` is a RANKING input, not a display one — the dinner screen stopped printing it
 * on 2026-08-16 at Alisa's request. Keep computing it: it is the tiebreak that puts the
 * recipe she is closest to at the top, and collapsing the two counts into one is the bug
 * this whole file exists to prevent.
 */

import { choiceLabel, coversByPrefix, ingredientNames } from './ingredients'
import type { IngredientEntry, Recipe, Uuid } from './types'

export type IngredientState = 'have' | 'dontHave' | 'unknown'

/**
 * One ingredient line, and every registry entry that would satisfy it.
 *
 * "minced or ground lamb or beef" is ONE requirement with TWO answers. It is confirmed if
 * she has either, and it is only `missing` once she has ruled out every one of them —
 * which is the whole point: saying "no beef" must not hide a recipe that would happily
 * take the lamb.
 */
export type Choice = {
  /** "lamb or beef" — what the card prints. */
  label: string
  /** The name a `+` tap should mark as had: the line's own first choice. */
  primary: string
  /** Registry uuids, in the line's printed order. */
  uuids: Uuid[]
}

/**
 * A recipe's requirements as lines. Recipes written before `ingredientChoices` existed get
 * one choice per indexed ingredient, which is exactly what they meant.
 */
export function choicesOf(recipe: Recipe): Uuid[][] {
  return recipe.ingredientChoices ?? recipe.ingredientIndex.map((uuid) => [uuid])
}

export type Match = {
  recipe: Recipe
  /** Canonical names she said she HAS. What the recipe makes use of. */
  confirmed: string[]
  /**
   * How many of HER MARKS this recipe uses — not how many of its lines matched. One mark
   * can confirm several lines through the prefix rule (a pantry `beef` covers `beef` and
   * `ground beef`), so `confirmed.length` overcounts her picks and reported "uses 4 of
   * your 3". This is the number the filter and the tally use.
   */
  matched: number
  /** Lines where she ruled out EVERY option. Hard — she told us. */
  missing: Choice[]
  /** Lines she never mentioned. Soft — she has forty things in that kitchen. */
  notSure: Choice[]
  /**
   * Registry uuids still unanswered on this recipe, across `missing` and `notSure`. What
   * `nextQuestions` is allowed to ask about — uuids rather than names, so an entry found
   * through an alias is still askable.
   */
  open: Uuid[]
  /** confirmed / required. 1 when nothing is required. Reported, not sorted on. */
  coverage: number
}

function isMarked(state: IngredientState | undefined): state is 'have' | 'dontHave' {
  return state === 'have' || state === 'dontHave'
}

/** Every name a registry entry answers to: its canonical plus its aliases. */
function namesOf(entry: IngredientEntry): string[] {
  return [entry.canonical, ...entry.aliases]
}

type Mark = { entry: IngredientEntry; state: 'have' | 'dontHave'; names: string[] }

/**
 * How a mark on one registry entry reaches another. In priority order:
 *
 *   1. a mark on the entry itself
 *   2. a mark on an entry that shares a name with it (alias hit: her `spring onion`
 *      tile satisfies a recipe's `scallion` entry, whose aliases include `spring onion`)
 *   3. a mark on a more general entry, by the prefix convention: `chicken` covers
 *      `chicken thigh`, but NOT `chicken stock` — see `coversByPrefix`, which guards both
 *      the trailing space (`chick` must never match `chicken`) and the derived products
 *      that are a different thing on the shelf. The most specific prefix wins.
 *
 * Within a tier a `dontHave` beats a `have`: "I'm out of it" is the hard fact.
 */
type Resolution = { state: IngredientState; via?: string }

function resolveState(
  entry: IngredientEntry,
  states: Record<string, IngredientState>,
  marks: Mark[],
): Resolution {
  const direct = states[entry.uuid]
  if (isMarked(direct)) return { state: direct, via: entry.uuid }

  const names = namesOf(entry)
  let best: { tier: number; specificity: number; state: 'have' | 'dontHave'; via: string } | undefined

  for (const mark of marks) {
    if (mark.entry.uuid === entry.uuid) continue
    let tier = 0
    let specificity = 0
    if (mark.names.some((n) => names.includes(n))) {
      tier = 2
    } else {
      for (const general of mark.names) {
        if (names.some((n) => coversByPrefix(general, n))) {
          tier = 1
          specificity = Math.max(specificity, general.length)
        }
      }
    }
    if (tier === 0) continue
    const better =
      !best ||
      tier > best.tier ||
      (tier === best.tier && specificity > best.specificity) ||
      (tier === best.tier && specificity === best.specificity && mark.state === 'dontHave')
    if (better) best = { tier, specificity, state: mark.state, via: mark.entry.uuid }
  }

  return best ? { state: best.state, via: best.via } : { state: 'unknown' }
}

/**
 * What tonight's marks say about one registry entry, after alias and prefix resolution.
 * The recipe detail screen uses this to put a ✓ or the word "missing" on an ingredient
 * row — the same answer the dinner screen gave, never a second opinion.
 */
export function stateFor(
  entry: IngredientEntry,
  states: Record<string, IngredientState>,
  registry: IngredientEntry[],
): IngredientState {
  return resolveState(entry, states, collectMarks(states, registry)).state
}

/**
 * The same answer for a line that offers a choice: `have` if she has any of them,
 * `dontHave` only once she has ruled out all of them, `unknown` otherwise.
 *
 * Used by the recipe screen so an ingredient row and the dinner screen never disagree —
 * one resolution, two places that show it.
 */
export function stateForNames(
  names: string[],
  states: Record<string, IngredientState>,
  registry: IngredientEntry[],
): IngredientState {
  const marks = collectMarks(states, registry)
  const entries = names.flatMap((name) => {
    const entry = registry.find((e) => e.canonical === name || e.aliases.includes(name))
    return entry && !entry.isStaple ? [entry] : []
  })
  if (entries.length === 0) return 'unknown'

  let allOut = true
  for (const entry of entries) {
    const { state } = resolveState(entry, states, marks)
    if (state === 'have') return 'have'
    if (state !== 'dontHave') allOut = false
  }
  return allOut ? 'dontHave' : 'unknown'
}

function collectMarks(states: Record<string, IngredientState>, registry: IngredientEntry[]): Mark[] {
  const byUuid = new Map(registry.map((e) => [e.uuid, e]))
  const marks: Mark[] = []
  for (const [uuid, state] of Object.entries(states)) {
    const entry = byUuid.get(uuid)
    if (entry && isMarked(state)) marks.push({ entry, state, names: namesOf(entry) })
  }
  return marks
}

/**
 * The names in a recipe that appear ONLY as optional lines. A garnish never blocks
 * feasibility — but if the same ingredient is also a real line, it's required.
 */
function optionalOnly(recipe: Recipe): Set<string> {
  const required = new Set<string>()
  const optional = new Set<string>()
  for (const group of recipe.ingredients) {
    for (const item of group.items) {
      for (const name of ingredientNames(item)) {
        if (item.optional) optional.add(name)
        else required.add(name)
      }
    }
  }
  for (const name of required) optional.delete(name)
  return optional
}

/**
 * Rank every recipe against tonight's marks. Never filters — a strict filter returns
 * nothing most nights.
 *
 * Order: fewest `missing`, then MOST `confirmed`, then fewest `notSure`, then title.
 *
 * The `confirmed` key is load-bearing and was learned the hard way (Alisa, 2026-08-16):
 * with `notSure` as the first key after `missing`, "fewest unknowns" means "simplest
 * recipe", so marking beef, onion and carrot as HAVE left a five-line chicken recipe at
 * the top and her three marks did nothing she could see. Marking what she has is a
 * statement about what she wants to cook WITH; the ranking has to answer it. At cold
 * start nothing is confirmed, so this key is inert and the old simplest-first default is
 * exactly preserved.
 *
 * `coverage` is no longer a sort key: once missing, confirmed and notSure all tie it is
 * arithmetically forced to tie too, so it could never break anything.
 *
 * A recipe whose `ingredientIndex` names a uuid the registry doesn't have is left out
 * entirely: silence beats a confident wrong answer.
 */
export function matchPantry(
  recipes: Recipe[],
  states: Record<string, IngredientState>,
  registry: IngredientEntry[],
): Match[] {
  const byUuid = new Map(registry.map((e) => [e.uuid, e]))
  const marks = collectMarks(states, registry)

  const matches: Match[] = []

  for (const recipe of recipes) {
    const skip = optionalOnly(recipe)
    const confirmed: string[] = []
    const missing: Choice[] = []
    const notSure: Choice[] = []
    const open: Uuid[] = []
    // Which of HER marks this recipe actually uses, deduped — one mark reaching two
    // ingredients by prefix is still one thing she picked.
    const satisfied = new Set<string>()
    let unresolved = false

    for (const uuids of choicesOf(recipe)) {
      const entries: IngredientEntry[] = []
      for (const uuid of uuids) {
        const entry = byUuid.get(uuid)
        if (!entry) {
          unresolved = true
          break
        }
        entries.push(entry)
      }
      if (unresolved) break
      if (entries.length === 0) continue

      // A staple among the options satisfies the line outright — it is assumed present,
      // which is exactly what "butter or margarine" needs when butter is a staple.
      if (entries.some((entry) => entry.isStaple)) continue
      if (entries.every((entry) => namesOf(entry).some((n) => skip.has(n)))) continue

      // ANY of them satisfies the line; it is only missing once she has ruled out ALL of
      // them. Saying "no beef" must not hide a recipe that would take the lamb.
      let had: { name: string; via?: string } | undefined
      const stillOpen: Uuid[] = []
      for (const entry of entries) {
        const { state, via } = resolveState(entry, states, marks)
        if (state === 'have') {
          if (!had) had = { name: entry.canonical, via }
        } else if (state === 'unknown') stillOpen.push(entry.uuid)
      }

      if (had) {
        confirmed.push(had.name)
        if (had.via) satisfied.add(had.via)
        continue
      }

      const choice: Choice = {
        label: choiceLabel(entries.map((entry) => entry.canonical)),
        primary: entries[0].canonical,
        uuids: entries.map((entry) => entry.uuid),
      }
      if (stillOpen.length > 0) {
        notSure.push(choice)
        open.push(...stillOpen)
      } else {
        missing.push(choice)
      }
    }
    if (unresolved) continue

    const required = confirmed.length + missing.length + notSure.length
    const coverage = required === 0 ? 1 : confirmed.length / required

    matches.push({ recipe, confirmed, matched: satisfied.size, missing, notSure, open, coverage })
  }

  matches.sort(
    (a, b) =>
      a.missing.length - b.missing.length ||
      b.matched - a.matched ||
      a.notSure.length - b.notSure.length ||
      a.recipe.title.localeCompare(b.recipe.title),
  )
  return matches
}

/**
 * Once she has said she HAS something, show only the recipes that use it — and when she
 * has said three things, only the recipes that use all three.
 *
 * A deliberate exception to "rank, never filter". The two directions are NOT symmetric,
 * which is why only this one filters:
 *
 *   dontHave  ruling things out is elimination. Filtering on it returns nothing most
 *             nights — that is the original "rank, never filter" argument, and it stands.
 *   have      saying what she has is a statement of INTENT: show me what uses this.
 *
 * ANY vs ALL, which took two goes to get right (Alisa, 2026-08-16). The first version kept
 * every recipe using *any* confirmed ingredient, and she did the arithmetic: beef was in
 * 16 recipes, onion in 36, both together showed 40, and adding carrot took it to 42. A
 * union GROWS as she says more, which is backwards — every tap is supposed to halve the
 * field, not widen it. "Shouldn't all 3 selected show ONLY the recipes that have all 3?"
 * Yes. So the bar is the best match available, not one match:
 *
 *   she marks 3 and some recipe uses all 3  → only those recipes
 *   she marks 3 and nothing uses more than 2 → the 2-of-3 recipes, rather than nothing
 *
 * That fallback is what keeps a strict AND honest. Plain intersection would blank the
 * screen the moment she marked a fourth thing no single recipe happens to combine, and an
 * empty screen is the failure this whole file exists to avoid. Adding a mark can now only
 * narrow the list or leave it alone — never widen it.
 */
export function shortlist(matches: Match[]): Match[] {
  let best = 0
  for (const match of matches) best = Math.max(best, match.matched)
  if (best === 0) return matches
  return matches.filter((match) => match.matched === best)
}

/**
 * The Twenty Questions move. The grid is not a dump of every ingredient: it offers the
 * ingredient that appears in closest to half the live candidates, so each tap roughly
 * halves the field. Re-rank after every tap.
 *
 * Never a staple (subtracted before matching, so a tap would do nothing). Never one
 * already answered. Never one no live candidate still needs. Ties go to the ingredient in
 * more recipes, then to the name — deterministic, so the grid doesn't shuffle under her.
 */
export function nextQuestions(
  candidates: Match[],
  registry: IngredientEntry[],
  states: Record<string, IngredientState>,
  n = 12,
): IngredientEntry[] {
  if (candidates.length === 0 || n <= 0) return []

  const byUuid = new Map(registry.map((e) => [e.uuid, e]))
  const uses = new Map<string, number>()

  for (const match of candidates) {
    // `open` is uuids, not names — so an entry the recipe reached through an alias is
    // still askable, and a line offering a choice offers each of its options.
    for (const uuid of new Set(match.open)) {
      const entry = byUuid.get(uuid)
      if (!entry || entry.isStaple || isMarked(states[uuid])) continue
      uses.set(uuid, (uses.get(uuid) ?? 0) + 1)
    }
  }

  const total = candidates.length
  return [...uses.entries()]
    .map(([uuid, count]) => ({ entry: byUuid.get(uuid)!, count, split: Math.abs(count / total - 0.5) }))
    .sort(
      (a, b) =>
        a.split - b.split || b.count - a.count || a.entry.canonical.localeCompare(b.entry.canonical),
    )
    .slice(0, n)
    .map((x) => x.entry)
}
