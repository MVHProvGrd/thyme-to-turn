import { describe, it, expect } from 'vitest'
import { matchPantry, nextQuestions, stateFor } from '../pantry'
import type { IngredientState } from '../pantry'
import type { IngredientEntry, Recipe } from '../types'

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
    expect(m.notSure).toEqual(['chicken', 'fennel', 'bread'])
    expect(m.notSure).not.toContain('salt')
    expect(m.notSure).not.toContain('olive oil')
  })

  it('excludes optional lines - garnishes never block feasibility', () => {
    const [m] = matchPantry([lentilSoup], {}, REGISTRY)
    expect(m.notSure).toEqual(['lentil', 'onion', 'garlic'])
    // Even ruled out, a garnish costs nothing.
    const [ruled] = matchPantry([lentilSoup], states({ parsley: 'dontHave' }), REGISTRY)
    expect(ruled.missing).toEqual([])
  })

  it('excludes a recipe with unresolved ingredient ids - never claims it ready', () => {
    const ghost = recipe('Ghost', ['unicorn', 'onion'], REGISTRY)
    expect(ghost.ingredientIndex).toContain('unresolved:unicorn')
    const matches = matchPantry([ghost, lentilSoup], {}, REGISTRY)
    expect(matches.map((m) => m.recipe.title)).toEqual(['Lentil soup'])
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
    expect(ranked[1].confirmed).toEqual([])
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
    expect(m.missing).toEqual(['scallion'])
    const [have] = matchPantry([scallionPancake], { 'id:spring-onion-separate': 'have' }, registry)
    expect(have.missing).toEqual([])
    expect(have.notSure).toEqual([])
  })

  it('prefix hit: `chicken` satisfies `chicken thigh`', () => {
    const [m] = matchPantry([chickenThighs], states({ chicken: 'have' }), REGISTRY)
    expect(m.notSure).toEqual(['onion', 'cream'])
    const [out] = matchPantry([chickenThighs], states({ chicken: 'dontHave' }), REGISTRY)
    expect(out.missing).toEqual(['chicken thigh'])
  })

  it('prefix miss: `chick` must not match `chicken`, and `chicken` must not match `chickpea`', () => {
    const chick = entry('chick', { uuid: 'id:chick' })
    const registry = [...REGISTRY, chick]
    const [m] = matchPantry([roastChicken], { 'id:chick': 'dontHave' }, registry)
    expect(m.missing).toEqual([])
    const [stew] = matchPantry([chickpeaStew], states({ chicken: 'dontHave' }), REGISTRY)
    expect(stew.missing).toEqual([])
    expect(stew.notSure).toContain('chickpea')
  })

  it('a direct mark on the specific entry beats a prefix mark on the general one', () => {
    const marks = states({ chicken: 'have', 'chicken thigh': 'dontHave' })
    const [m] = matchPantry([chickenThighs], marks, REGISTRY)
    expect(m.missing).toEqual(['chicken thigh'])
  })

  it('ignores marks on uuids the registry does not know', () => {
    const [m] = matchPantry([lentilSoup], { 'id:nobody': 'dontHave' }, REGISTRY)
    expect(m.missing).toEqual([])
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
      const needsGarlic = was.notSure.includes('garlic')
      expect(m.missing).toEqual(needsGarlic ? ['garlic'] : [])
      expect(m.notSure).toEqual(was.notSure.filter((n) => n !== 'garlic'))
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
      expect(m.missing).toEqual(was.missing)
      expect(m.notSure).not.toContain('onion')
      expect(m.notSure).toEqual(was.notSure.filter((n) => n !== 'onion'))
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
