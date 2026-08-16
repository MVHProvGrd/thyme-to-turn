import { describe, it, expect } from 'vitest'
import { matchPantry, nextQuestions, shortlist, stateFor, stateForNames } from '../pantry'
import type { IngredientState } from '../pantry'
import type { IngredientEntry, Recipe } from '../types'

/**
 * `missing` and `notSure` are lists of CHOICES — one entry per ingredient line, each
 * holding every name that would satisfy it ("lamb or beef"). These assertions are about
 * which lines are still open, so they compare the printed labels.
 */
const labelsOf = (choices: { label: string }[]) => choices.map((c) => c.label)

/**
 * The tests for the feature where a wrong answer is invisible: she just never sees a
 * recipe she could have cooked, and never knows. Every rule from CLAUDE.md "Pantry search"
 * has a test here, and the one that matters most is in the "two filters" block —
 * a `have` mark must never increase any recipe's `missing` count.
 */

/* ------------------------------------------------------------------ fixtures */

function entry(
  canonical: string,
  extra: Partial<Pick<IngredientEntry, 'aliases' | 'isStaple' | 'uuid'>> = {},
): IngredientEntry {
  return {
    uuid: extra.uuid ?? `id:${canonical}`,
    canonical,
    aliases: extra.aliases ?? [],
    isStaple: extra.isStaple ?? false,
    createdAt: '2026-01-01T00:00:00.000Z',
    seenCount: 0,
  }
}

const REGISTRY: IngredientEntry[] = [
  entry('salt', { isStaple: true }),
  entry('olive oil', { isStaple: true }),
  entry('chicken'),
  entry('chicken thigh'),
  entry('chickpea'),
  entry('fennel'),
  entry('bread'),
  entry('lentil'),
  entry('onion'),
  entry('garlic'),
  entry('spaghetti'),
  entry('anchovy'),
  entry('cream'),
  entry('parmesan'),
  entry('scallion', { aliases: ['spring onion', 'green onion'] }),
  entry('parsley'),
  entry('spring onion', { uuid: 'id:spring-onion-separate' }),
  entry('lamb'),
  entry('beef'),
  entry('butter', { isStaple: true }),
  entry('margarine'),
  entry('rice'),
]

/** Build a recipe from ingredient names. `?name` marks that line optional. */
function recipe(title: string, names: string[], registry = REGISTRY): Recipe {
  const items = names.map((n) => {
    const optional = n.startsWith('?')
    const canonical = optional ? n.slice(1) : n
    return { raw: canonical, item: canonical, canonical, ...(optional ? { optional: true } : {}) }
  })
  const ingredientIndex = items.map((item) => {
    const hit = registry.find((e) => e.canonical === item.canonical || e.aliases.includes(item.canonical))
    // Unresolvable on purpose in one test: keep the string so it can't accidentally match.
    return hit ? hit.uuid : `unresolved:${item.canonical}`
  })
  return {
    uuid: `r:${title}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title,
    source: { kind: 'other' },
    ingredients: [{ items }],
    steps: [],
    tags: [],
    photos: [],
    ingredientIndex: [...new Set(ingredientIndex)],
    verified: true,
  }
}

/**
 * A recipe whose lines can offer a choice: `['rice', ['lamb', 'beef']]` is two lines, the
 * second satisfied by either. This is the shape `db/repo.ts` writes for a page that says
 * "minced or ground lamb or beef".
 */
function choiceRecipe(title: string, lines: (string | string[])[], registry = REGISTRY): Recipe {
  const uuidFor = (name: string) => {
    const hit = registry.find((e) => e.canonical === name || e.aliases.includes(name))
    return hit ? hit.uuid : `unresolved:${name}`
  }
  const groups = lines.map((line) => (Array.isArray(line) ? line : [line]))
  const items = groups.map(([canonical, ...alternatives]) => ({
    raw: [canonical, ...alternatives].join(' or '),
    item: [canonical, ...alternatives].join(' or '),
    canonical,
    ...(alternatives.length ? { alternatives } : {}),
  }))
  const ingredientChoices = groups.map((names) => names.map(uuidFor))
  return {
    uuid: `r:${title}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    title,
    source: { kind: 'other' },
    ingredients: [{ items }],
    steps: [],
    tags: [],
    photos: [],
    ingredientIndex: [...new Set(ingredientChoices.flat())],
    ingredientChoices,
    verified: true,
  }
}

const roastChicken = recipe('Roast chicken', ['chicken', 'fennel', 'bread', 'olive oil', 'salt'])
const lentilSoup = recipe('Lentil soup', ['lentil', 'onion', 'garlic', 'salt', '?parsley'])
const spaghetti = recipe('Spaghetti with anchovies', ['spaghetti', 'anchovy', 'garlic', 'bread'])
const chickenThighs = recipe('Braised chicken thighs', ['chicken thigh', 'onion', 'cream'])
const chickpeaStew = recipe('Chickpea stew', ['chickpea', 'onion', 'garlic'])

const RECIPES = [roastChicken, lentilSoup, spaghetti, chickenThighs, chickpeaStew]

function states(marks: Record<string, IngredientState>): Record<string, IngredientState> {
  const out: Record<string, IngredientState> = {}
  for (const [name, state] of Object.entries(marks)) {
    const hit = REGISTRY.find((e) => e.canonical === name)
    if (!hit) throw new Error(`test fixture: no registry entry called ${name}`)
    out[hit.uuid] = state
  }
  return out
}

function byTitle(matches: ReturnType<typeof matchPantry>, title: string) {
  const hit = matches.find((m) => m.recipe.title === title)
  if (!hit) throw new Error(`no match for ${title}`)
  return hit
}

/* --------------------------------------------------------------- the rules */

describe('matchPantry: what counts as required', () => {
  it('excludes staples from the requirement', () => {
    const [m] = matchPantry([roastChicken], {}, REGISTRY)
    expect(labelsOf(m.notSure)).toEqual(['chicken', 'fennel', 'bread'])
    expect(labelsOf(m.notSure)).not.toContain('salt')
    expect(labelsOf(m.notSure)).not.toContain('olive oil')
  })

  it('excludes optional lines - garnishes never block feasibility', () => {
    const [m] = matchPantry([lentilSoup], {}, REGISTRY)
    expect(labelsOf(m.notSure)).toEqual(['lentil', 'onion', 'garlic'])
    // Even ruled out, a garnish costs nothing.
    const [ruled] = matchPantry([lentilSoup], states({ parsley: 'dontHave' }), REGISTRY)
    expect(labelsOf(ruled.missing)).toEqual([])
  })

  it('excludes a recipe with unresolved ingredient ids - never claims it ready', () => {
    const ghost = recipe('Ghost', ['unicorn', 'onion'], REGISTRY)
    expect(ghost.ingredientIndex).toContain('unresolved:unicorn')
    const matches = matchPantry([ghost, lentilSoup], {}, REGISTRY)
    expect(matches.map((m) => m.recipe.title)).toEqual(['Lentil soup'])
  })

  it('counts HER marks, not matching lines — one mark reaching two ingredients is one', () => {
    // A pantry `chicken` confirms both `chicken` and `chicken thigh` by the prefix rule.
    // Counting lines made the tally say "uses 4 of your 3"; it is her picks that count.
    const registry = [entry('chicken'), entry('chicken thigh'), entry('rice')]
    const both = recipe('Chicken two ways', ['chicken', 'chicken thigh', 'rice'], registry)
    const [m] = matchPantry([both], { 'id:chicken': 'have' }, registry)
    expect(m.confirmed).toEqual(['chicken', 'chicken thigh'])
    expect(m.matched).toBe(1)
  })

  it('ranks by what she HAS, not by what is simplest — the beef-stew case', () => {
    // Alisa, 2026-08-16: marking beef/onion/carrot left a five-line chicken recipe on top,
    // because "fewest unknowns" is "simplest recipe" and her marks did nothing visible.
    const registry = [
      entry('beef'), entry('onion'), entry('carrot'), entry('stock'),
      entry('potato'), entry('celery'), entry('bay leaf'), entry('chicken'), entry('lemon'),
    ]
    const stew = recipe('Beef stew', ['beef', 'onion', 'carrot', 'stock', 'potato', 'celery', 'bay leaf'], registry)
    const roast = recipe('Roast chicken', ['chicken', 'lemon'], registry)
    const marks: Record<string, IngredientState> = {
      'id:beef': 'have', 'id:onion': 'have', 'id:carrot': 'have',
    }
    const ranked = matchPantry([roast, stew], marks, registry)
    expect(ranked.map((m) => m.recipe.title)).toEqual(['Beef stew', 'Roast chicken'])
    expect(ranked[0].confirmed).toEqual(['beef', 'onion', 'carrot'])
    expect(ranked[0].matched).toBe(3)
    expect(ranked[1].confirmed).toEqual([])
    expect(ranked[1].matched).toBe(0)
    // The simplest recipe still wins when she has said nothing — the cold-start default.
    expect(matchPantry([roast, stew], {}, registry).map((m) => m.recipe.title)).toEqual([
      'Roast chicken',
      'Beef stew',
    ])
  })

  it('reports coverage as confirmed / required', () => {
    const [m] = matchPantry([roastChicken], states({ chicken: 'have', fennel: 'have' }), REGISTRY)
    expect(m.coverage).toBeCloseTo(2 / 3)
    const [none] = matchPantry([recipe('Toast', ['salt'])], {}, REGISTRY)
    expect(none.coverage).toBe(1)
  })
})

describe('matchPantry: how a mark reaches an ingredient', () => {
  it('alias hit: a mark on `spring onion` finds a recipe using the `scallion` entry', () => {
    const registry = [...REGISTRY, entry('flour', { isStaple: true })]
    const scallionPancake = recipe('Scallion pancake', ['scallion', 'flour'], registry)
    const [m] = matchPantry([scallionPancake], { 'id:spring-onion-separate': 'dontHave' }, registry)
    expect(labelsOf(m.missing)).toEqual(['scallion'])
    const [have] = matchPantry([scallionPancake], { 'id:spring-onion-separate': 'have' }, registry)
    expect(labelsOf(have.missing)).toEqual([])
    expect(labelsOf(have.notSure)).toEqual([])
  })

  it('prefix hit: `chicken` satisfies `chicken thigh`', () => {
    const [m] = matchPantry([chickenThighs], states({ chicken: 'have' }), REGISTRY)
    expect(labelsOf(m.notSure)).toEqual(['onion', 'cream'])
    const [out] = matchPantry([chickenThighs], states({ chicken: 'dontHave' }), REGISTRY)
    expect(labelsOf(out.missing)).toEqual(['chicken thigh'])
  })

  it('prefix miss: `chick` must not match `chicken`, and `chicken` must not match `chickpea`', () => {
    const chick = entry('chick', { uuid: 'id:chick' })
    const registry = [...REGISTRY, chick]
    const [m] = matchPantry([roastChicken], { 'id:chick': 'dontHave' }, registry)
    expect(labelsOf(m.missing)).toEqual([])
    const [stew] = matchPantry([chickpeaStew], states({ chicken: 'dontHave' }), REGISTRY)
    expect(labelsOf(stew.missing)).toEqual([])
    expect(labelsOf(stew.notSure)).toContain('chickpea')
  })

  it('a mark on chicken does NOT reach chicken stock — the shrimp-recipe bug', () => {
    const registry = [entry('chicken'), entry('chicken stock'), entry('shrimp'), entry('chicken thigh')]
    const shrimp = recipe('Shrimp bisque', ['shrimp', 'chicken stock'], registry)
    const thighs = recipe('Braised thighs', ['chicken thigh'], registry)
    const marks = { 'id:chicken': 'have' as const }

    const [bisque] = matchPantry([shrimp], marks, registry)
    expect(bisque.confirmed).toEqual([]) // stock is a different thing on the shelf
    expect(labelsOf(bisque.notSure)).toEqual(['shrimp', 'chicken stock'])

    const [braised] = matchPantry([thighs], marks, registry)
    expect(braised.confirmed).toEqual(['chicken thigh']) // a cut still matches

    // And it must not be shortlisted alongside the recipe that really uses chicken.
    expect(shortlist(matchPantry([shrimp, thighs], marks, registry)).map((m) => m.recipe.title)).toEqual([
      'Braised thighs',
    ])
  })

  it('a direct mark on the specific entry beats a prefix mark on the general one', () => {
    const marks = states({ chicken: 'have', 'chicken thigh': 'dontHave' })
    const [m] = matchPantry([chickenThighs], marks, REGISTRY)
    expect(labelsOf(m.missing)).toEqual(['chicken thigh'])
  })

  it('ignores marks on uuids the registry does not know', () => {
    const [m] = matchPantry([lentilSoup], { 'id:nobody': 'dontHave' }, REGISTRY)
    expect(labelsOf(m.missing)).toEqual([])
  })
})

/**
 * `notSure` is no longer printed on the card (Alisa, 2026-08-16) but it still ranks, so
 * these assertions matter as much as they ever did — arguably more, since a wrong
 * `notSure` is now invisible rather than merely wrong on screen.
 */
describe('matchPantry: the two filters, live at once', () => {
  it('cold start: every recipe at missing 0, sorted by fewest notSure', () => {
    const matches = matchPantry(RECIPES, {}, REGISTRY)
    expect(matches.every((m) => m.missing.length === 0)).toBe(true)
    const counts = matches.map((m) => m.notSure.length)
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    // Ties fall to title, so the order is stable and explainable.
    expect(matches.map((m) => m.recipe.title)).toEqual([
      'Braised chicken thighs',
      'Chickpea stew',
      'Lentil soup',
      'Roast chicken',
      'Spaghetti with anchovies',
    ])
  })

  it('marking one thing dontHave moves exactly the recipes needing it and no others', () => {
    const before = matchPantry(RECIPES, {}, REGISTRY)
    const after = matchPantry(RECIPES, states({ garlic: 'dontHave' }), REGISTRY)
    for (const m of after) {
      const was = byTitle(before, m.recipe.title)
      const needsGarlic = labelsOf(was.notSure).includes('garlic')
      expect(labelsOf(m.missing)).toEqual(needsGarlic ? ['garlic'] : [])
      expect(labelsOf(m.notSure)).toEqual(labelsOf(was.notSure).filter((n) => n !== 'garlic'))
    }
    expect(after.filter((m) => m.missing.length === 1).map((m) => m.recipe.title).sort()).toEqual([
      'Chickpea stew',
      'Lentil soup',
      'Spaghetti with anchovies',
    ])
  })

  it('marking one thing have moves it out of notSure and changes no recipe missing list', () => {
    const marks = states({ garlic: 'dontHave', cream: 'dontHave' })
    const before = matchPantry(RECIPES, marks, REGISTRY)
    const after = matchPantry(RECIPES, { ...marks, ...states({ onion: 'have' }) }, REGISTRY)
    for (const m of after) {
      const was = byTitle(before, m.recipe.title)
      expect(labelsOf(m.missing)).toEqual(labelsOf(was.missing))
      expect(labelsOf(m.notSure)).not.toContain('onion')
      expect(labelsOf(m.notSure)).toEqual(labelsOf(was.notSure).filter((n) => n !== 'onion'))
    }
  })

  it('a have mark never increases any recipe missing count - the regression test', () => {
    const marks = states({ garlic: 'dontHave', bread: 'dontHave' })
    const before = matchPantry(RECIPES, marks, REGISTRY)
    for (const e of REGISTRY) {
      const after = matchPantry(RECIPES, { ...marks, [e.uuid]: 'have' }, REGISTRY)
      for (const m of after) {
        expect(m.missing.length).toBeLessThanOrEqual(byTitle(before, m.recipe.title).missing.length)
      }
    }
  })

  it('sorts by missing, then MOST confirmed, then fewest notSure, then title', () => {
    const marks = states({ chicken: 'have', fennel: 'have', bread: 'dontHave', cream: 'dontHave' })
    const matches = matchPantry(RECIPES, marks, REGISTRY)
    expect(matches.map((m) => [m.recipe.title, m.missing.length, m.notSure.length])).toEqual([
      ['Chickpea stew', 0, 3],
      ['Lentil soup', 0, 3],
      ['Roast chicken', 1, 0],
      ['Braised chicken thighs', 1, 1], // chicken thigh confirmed by prefix
      ['Spaghetti with anchovies', 1, 3],
    ])
  })
})

describe('shortlist: once she says she HAS something, show what uses it', () => {
  it('keeps only recipes that use something she confirmed', () => {
    const marks = states({ garlic: 'have' })
    const shown = shortlist(matchPantry(RECIPES, marks, REGISTRY))
    expect(shown.map((m) => m.recipe.title).sort()).toEqual([
      'Chickpea stew',
      'Lentil soup',
      'Spaghetti with anchovies',
    ])
    expect(shown.every((m) => m.confirmed.includes('garlic'))).toBe(true)
  })

  it('marks two things: only recipes that use BOTH — a second mark must never widen', () => {
    const one = shortlist(matchPantry(RECIPES, states({ garlic: 'have' }), REGISTRY))
    const two = shortlist(matchPantry(RECIPES, states({ garlic: 'have', onion: 'have' }), REGISTRY))
    expect(two.map((m) => m.recipe.title)).toEqual(['Chickpea stew', 'Lentil soup'])
    expect(two.every((m) => m.matched === 2)).toBe(true)
    // The whole point of the AND: saying more never means seeing more.
    expect(two.length).toBeLessThanOrEqual(one.length)
  })

  it('falls back to the best available rather than blanking when nothing uses them all', () => {
    // No recipe here has both garlic and cream, so the 1-of-2 recipes are the best answer.
    const shown = shortlist(matchPantry(RECIPES, states({ garlic: 'have', cream: 'have' }), REGISTRY))
    expect(shown.length).toBeGreaterThan(0)
    expect(shown.every((m) => m.matched === 1)).toBe(true)
    expect(shown.map((m) => m.recipe.title)).toContain('Braised chicken thighs')
  })

  it('shows everything when she has confirmed nothing — the cold start is untouched', () => {
    const all = matchPantry(RECIPES, {}, REGISTRY)
    expect(shortlist(all)).toBe(all)
  })

  it('ruling things OUT never filters — that direction would empty the screen', () => {
    const marks = states({ garlic: 'dontHave', cream: 'dontHave' })
    const all = matchPantry(RECIPES, marks, REGISTRY)
    expect(shortlist(all)).toBe(all)
    expect(shortlist(all)).toHaveLength(RECIPES.length)
  })

  it('never blanks the screen: marking something no recipe uses shows everything', () => {
    const marks = states({ parmesan: 'have' }) // in the registry, in none of these recipes
    const all = matchPantry(RECIPES, marks, REGISTRY)
    expect(shortlist(all)).toBe(all)
  })
})

/* ------------------------------------------------------------ nextQuestions */

describe('nextQuestions: the Twenty Questions move', () => {
  it('never returns a staple, an answered ingredient, or one no live candidate uses', () => {
    const marks = states({ garlic: 'dontHave', onion: 'have' })
    const candidates = matchPantry(RECIPES, marks, REGISTRY)
    const asked = nextQuestions(candidates, REGISTRY, marks).map((e) => e.canonical)
    expect(asked).not.toContain('salt')
    expect(asked).not.toContain('olive oil')
    expect(asked).not.toContain('garlic')
    expect(asked).not.toContain('onion')
    expect(asked).not.toContain('parmesan') // in the registry, in no recipe
    expect(asked).not.toContain('parsley') // only ever optional
    expect(asked).not.toContain('scallion')
  })

  it('offers the ingredient closest to a 50/50 split first', () => {
    const candidates = matchPantry(RECIPES, {}, REGISTRY)
    // Of the 5 live recipes: onion in 3 (0.6), garlic in 3 (0.6), bread in 2 (0.4),
    // everything else in 1 (0.2).
    const asked = nextQuestions(candidates, REGISTRY, {}).map((e) => e.canonical)
    expect(asked.slice(0, 3).sort()).toEqual(['bread', 'garlic', 'onion'])
    expect(asked.slice(3).every((n) => !['bread', 'garlic', 'onion'].includes(n))).toBe(true)
  })

  it('prefers a 50/50 split over a 90/10 one', () => {
    const registry = [entry('a'), entry('b'), entry('c'), entry('d')]
    const recipes = Array.from({ length: 10 }, (_, i) =>
      recipe(`r${i}`, ['d', ...(i < 5 ? ['a'] : []), ...(i < 9 ? ['b'] : []), ...(i < 1 ? ['c'] : [])], registry),
    )
    const candidates = matchPantry(recipes, {}, registry)
    expect(nextQuestions(candidates, registry, {}).map((e) => e.canonical)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('caps at n and re-ranks after a tap', () => {
    const candidates = matchPantry(RECIPES, {}, REGISTRY)
    expect(nextQuestions(candidates, REGISTRY, {}, 2)).toHaveLength(2)
    const marks = states({ onion: 'dontHave', garlic: 'dontHave' })
    const narrowed = matchPantry(RECIPES, marks, REGISTRY).filter((m) => m.missing.length <= 1)
    const asked = nextQuestions(narrowed, REGISTRY, marks).map((e) => e.canonical)
    expect(asked).not.toContain('onion')
    expect(asked).not.toContain('garlic')
    expect(asked.length).toBeGreaterThan(0)
  })

  it('returns nothing when there are no candidates', () => {
    expect(nextQuestions([], REGISTRY, {})).toEqual([])
  })
})

describe('stateFor: the detail screen asks the same engine', () => {
  const byName = (name: string) => REGISTRY.find((e) => e.canonical === name)!

  it('answers direct, alias and prefix marks exactly as matchPantry does', () => {
    const marks = { ...states({ garlic: 'dontHave', chicken: 'have' }), 'id:spring-onion-separate': 'dontHave' as const }
    expect(stateFor(byName('garlic'), marks, REGISTRY)).toBe('dontHave')
    expect(stateFor(byName('chicken thigh'), marks, REGISTRY)).toBe('have')
    expect(stateFor(byName('scallion'), marks, REGISTRY)).toBe('dontHave')
    expect(stateFor(byName('chickpea'), marks, REGISTRY)).toBe('unknown')
    expect(stateFor(byName('onion'), marks, REGISTRY)).toBe('unknown')
  })
})

/**
 * A line that offers a choice — "minced or ground lamb or beef".
 *
 * It is ONE requirement with several answers. The failure this block exists to prevent is
 * the silent one: she says "no beef", and a recipe that would happily take the lamb
 * disappears from the list without ever telling her why.
 */
describe('alternatives: any one of them satisfies the line', () => {
  const kofta = choiceRecipe('Kofta', ['onion', ['lamb', 'beef']])
  const cake = choiceRecipe('Cake', [['butter', 'margarine'], 'rice'])
  const only = [kofta]

  it('ruling out ONE option leaves the line open, not missing', () => {
    const [m] = matchPantry(only, states({ beef: 'dontHave' }), REGISTRY)
    expect(labelsOf(m.missing)).toEqual([])
    expect(labelsOf(m.notSure)).toContain('lamb or beef')
  })

  it('ruling out EVERY option is what makes it missing, and it says so in full', () => {
    const [m] = matchPantry(only, states({ beef: 'dontHave', lamb: 'dontHave' }), REGISTRY)
    expect(labelsOf(m.missing)).toEqual(['lamb or beef'])
    expect(m.missing[0].primary).toBe('lamb')
    expect(m.missing[0].uuids).toEqual(['id:lamb', 'id:beef'])
  })

  it('having either one confirms the line', () => {
    for (const name of ['lamb', 'beef']) {
      const [m] = matchPantry(only, states({ [name]: 'have' }), REGISTRY)
      expect(m.confirmed).toEqual([name])
      expect(labelsOf(m.notSure)).toEqual(['onion'])
    }
  })

  it('one confirmed option counts as one mark used, not two', () => {
    const [m] = matchPantry(only, states({ lamb: 'have' }), REGISTRY)
    expect(m.matched).toBe(1)
  })

  it('a staple among the options satisfies the line outright', () => {
    // butter is a staple, so "butter or margarine" is never a question.
    const [m] = matchPantry([cake], {}, REGISTRY)
    expect(labelsOf(m.notSure)).toEqual(['rice'])
  })

  it('the grid can still ask about either option', () => {
    const matches = matchPantry(only, {}, REGISTRY)
    const asked = nextQuestions(matches, REGISTRY, {}).map((e) => e.canonical)
    expect(asked).toContain('lamb')
    expect(asked).toContain('beef')
  })

  it('stops asking about an option she has already answered', () => {
    const marks = states({ lamb: 'dontHave' })
    const matches = matchPantry(only, marks, REGISTRY)
    const asked = nextQuestions(matches, REGISTRY, marks).map((e) => e.canonical)
    expect(asked).not.toContain('lamb')
    expect(asked).toContain('beef')
  })

  it('a have mark never increases the missing count — the regression test, with choices', () => {
    const marks = states({ beef: 'dontHave' })
    const before = matchPantry(only, marks, REGISTRY)
    for (const e of REGISTRY) {
      const after = matchPantry(only, { ...marks, [e.uuid]: 'have' }, REGISTRY)
      expect(after[0].missing.length).toBeLessThanOrEqual(before[0].missing.length)
    }
  })

  it('recipes saved before choices existed match exactly as they did', () => {
    // No ingredientChoices on the row at all: every indexed ingredient is its own
    // requirement, which is what those recipes always meant.
    const legacy = recipe('Legacy', ['onion', 'garlic'])
    expect(legacy.ingredientChoices).toBeUndefined()
    const [m] = matchPantry([legacy], states({ garlic: 'dontHave' }), REGISTRY)
    expect(labelsOf(m.missing)).toEqual(['garlic'])
    expect(labelsOf(m.notSure)).toEqual(['onion'])
  })
})

describe('stateForNames: one row on the recipe screen', () => {
  it('is had when she has any option, and out only when she has ruled out all of them', () => {
    expect(stateForNames(['lamb', 'beef'], states({ beef: 'have' }), REGISTRY)).toBe('have')
    expect(stateForNames(['lamb', 'beef'], states({ beef: 'dontHave' }), REGISTRY)).toBe('unknown')
    expect(
      stateForNames(['lamb', 'beef'], states({ beef: 'dontHave', lamb: 'dontHave' }), REGISTRY),
    ).toBe('dontHave')
  })

  it('ignores staples and unknown names rather than inventing an answer', () => {
    expect(stateForNames(['salt'], states({ garlic: 'dontHave' }), REGISTRY)).toBe('unknown')
    expect(stateForNames(['unobtainium'], {}, REGISTRY)).toBe('unknown')
    expect(stateForNames([], {}, REGISTRY)).toBe('unknown')
  })
})
