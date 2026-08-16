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

import type { IngredientEntry, Recipe } from './types'

export type IngredientState = 'have' | 'dontHave' | 'unknown'

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
  /** Canonical names she ruled out. Hard — she told us. */
  missing: string[]
  /** Canonical names she never mentioned. Soft — she has forty things in that kitchen. */
  notSure: string[]
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
 *      `chicken thigh` because "chicken thigh".startsWith("chicken "). The trailing
 *      space is the guard — `chick` must never match `chicken`, nor `chicken` `chickpea`.
 *      The most specific prefix wins.
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
        if (names.some((n) => n.startsWith(general + ' '))) {
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
      if (!item.canonical) continue
      if (item.optional) optional.add(item.canonical)
      else required.add(item.canonical)
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
    const missing: string[] = []
    const notSure: string[] = []
    // Which of HER marks this recipe actually uses, deduped — one mark reaching two
    // ingredients by prefix is still one thing she picked.
    const satisfied = new Set<string>()
    let unresolved = false

    for (const uuid of recipe.ingredientIndex) {
      const entry = byUuid.get(uuid)
      if (!entry) {
        unresolved = true
        break
      }
      if (entry.isStaple) continue
      if (namesOf(entry).some((n) => skip.has(n))) continue

      const { state, via } = resolveState(entry, states, marks)
      if (state === 'have') {
        confirmed.push(entry.canonical)
        if (via) satisfied.add(via)
      } else if (state === 'dontHave') missing.push(entry.canonical)
      else notSure.push(entry.canonical)
    }
    if (unresolved) continue

    const required = confirmed.length + missing.length + notSure.length
    const coverage = required === 0 ? 1 : confirmed.length / required

    matches.push({ recipe, confirmed, matched: satisfied.size, missing, notSure, coverage })
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

  const byCanonical = new Map(registry.map((e) => [e.canonical, e]))
  const uses = new Map<string, number>()

  for (const match of candidates) {
    const open = new Set([...match.missing, ...match.notSure])
    for (const name of open) {
      const entry = byCanonical.get(name)
      if (!entry || entry.isStaple || isMarked(states[entry.uuid])) continue
      uses.set(entry.uuid, (uses.get(entry.uuid) ?? 0) + 1)
    }
  }

  const total = candidates.length
  const byUuid = new Map(registry.map((e) => [e.uuid, e]))
  return [...uses.entries()]
    .map(([uuid, count]) => ({ entry: byUuid.get(uuid)!, count, split: Math.abs(count / total - 0.5) }))
    .sort(
      (a, b) =>
        a.split - b.split || b.count - a.count || a.entry.canonical.localeCompare(b.entry.canonical),
    )
    .slice(0, n)
    .map((x) => x.entry)
}
