import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import Screen, { ScreenHeader } from '../components/Screen'
import { SearchField } from '../components/Field'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import SourceLine from '../components/SourceLine'
import Tile from '../components/Tile'
import { useFlip } from '../components/useFlip'
import { listCategories, listIngredients, listRecipes, listTags } from '../db/repo'
import { emojiFor } from '../lib/emoji'
import { fold } from '../lib/ingredients'
import {
  filterByLabels,
  hasCategory,
  labelFilterIsEmpty,
  unlistedLabels,
  vocabularyInUse,
} from '../lib/categories'
import type { LabelFilter } from '../lib/categories'
import { matchPantry, nextQuestions, shortlist } from '../lib/pantry'
import type { Choice, IngredientState, Match } from '../lib/pantry'
import type { IngredientEntry } from '../lib/types'
import { prefersReducedMotion } from '../platform/motion'
import { readSession, writeSession } from '../platform/prefs'

/**
 * "What can I make?" — the screen the whole app exists for.
 *
 * She's at the open fridge, one hand, arm's length. She taps what she's out of; the list
 * re-ranks under her thumb, synchronously, on every tap. No search button, no end state —
 * she stops when the answer is good enough.
 *
 * Two filters, both live at once, now with a tab each (Alisa, 2026-08-16 — the tri-state
 * tile cycle meant up to three taps to say one thing). The tab decides what a tap MEANS;
 * the tile still renders all three states. One tap marks, a second tap on the same tile
 * clears it. An ingredient already marked in one tab is not offered as a question in the
 * other — but a search shows everything, in whatever colour it actually is, so she can
 * always find a thing and change her mind about it.
 *
 * Every tile is still `unknown` / `dontHave` / `have`, and `unknown` still means unknown.
 * Both counts still exist and still rank the results — but only `missing` is printed. Alisa asked for the `not sure` line to come off the card
 * (2026-08-16): standing at the fridge she reads what she is out of, and a list of things
 * she never mentioned was noise. The distinction is now carried by the group she is in,
 * not by a label.
 *
 * The marks are session state only. "I have no chicken" and "not chicken tonight" are
 * indistinguishable, so they are never written into a standing pantry.
 */

type Marks = Record<string, IngredientState>

/** The two tabs. `leaf` is a marker colour only — it fails 4.5:1 as text, so Have reads thyme. */
type MarkTab = 'dontHave' | 'have'

const MARK_TABS: { state: MarkTab; label: string; groupLabel: string; activeClass: string }[] = [
  {
    state: 'have',
    label: 'Have',
    groupLabel: 'Ingredients you have',
    activeClass: 'border-leaf font-semibold text-thyme',
  },
  {
    state: 'dontHave',
    label: 'Don\u2019t have',
    groupLabel: 'Ingredients you are out of',
    activeClass: 'border-copper font-semibold text-copper',
  },
]

const QUESTIONS = 12
const ENOUGH_RECIPES = 15

export default function Dinner() {
  const navigate = useNavigate()
  const recipes = useLiveQuery(listRecipes, [], undefined)
  const registry = useLiveQuery(listIngredients, [], undefined)

  const [marks, setMarks] = useState<Marks>(() => readSession('marks', {}))
  /**
   * Her own labels, narrowing the pool before anything else runs. Session-scoped like the
   * ingredient marks — "kid approved tonight" is not a standing preference.
   */
  const [labels, setLabels] = useState<LabelFilter>(() => readSession('labels', { category: null, tags: [] }))
  /** Which menu is open. One at a time, so the page never becomes a wall of chips. */
  const [menu, setMenu] = useState<'category' | 'tags' | null>(null)
  // Which tab is open decides what a tap means. Have leads, at Alisa's request
  // (2026-08-16) — saying what she has is what narrows the list, so it is the tab she
  // opens on.
  const [tab, setTab] = useState<MarkTab>(() => readSession('markTab', 'have'))
  const [query, setQuery] = useState('')

  function updateMarks(next: Marks) {
    setMarks(next)
    writeSession('marks', next)
  }

  function setMark(uuid: string, state: IngredientState) {
    const next = { ...marks }
    // Dropping the key (rather than storing 'unknown') keeps the answered-tiles row honest.
    if (state === 'unknown') delete next[uuid]
    else next[uuid] = state
    updateMarks(next)
  }

  function selectTab(next: MarkTab) {
    setTab(next)
    writeSession('markTab', next)
  }

  /** One tap says it. Tapping the same tile again takes it back to unknown. */
  function tapTile(uuid: string) {
    setMark(uuid, (marks[uuid] ?? 'unknown') === tab ? 'unknown' : tab)
  }

  function reset() {
    updateMarks({})
    updateLabels({ category: null, tags: [] })
    setQuery('')
    setMenu(null)
  }

  function updateLabels(next: LabelFilter) {
    setLabels(next)
    writeSession('labels', next)
  }

  /** One category at a time — a recipe is breakfast or it is dinner. Tapping it again clears it. */
  function pickCategory(name: string) {
    const on = labels.category !== null && labels.category !== undefined && hasCategory([labels.category], name)
    updateLabels({ ...labels, category: on ? null : name })
  }

  /** Tags are ANDed: picking two means both. Tapping one again takes it back off. */
  function toggleTagFilter(name: string) {
    const current = labels.tags ?? []
    const on = hasCategory(current, name)
    updateLabels({ ...labels, tags: on ? current.filter((t) => !hasCategory([t], name)) : [...current, name] })
  }

  const categories = useLiveQuery(listCategories, [], undefined)
  const tagVocabulary = useLiveQuery(listTags, [], undefined)

  /*
   * Only labels something actually carries. A filter that can only ever return nothing is
   * worse than no filter, and this screen is trying hard not to become a wall of options.
   * Labels that have left BOTH vocabularies show with the categories — see unlistedLabels.
   */
  const catChoices = useMemo(() => {
    const all = recipes ?? []
    const list = categories ?? []
    return [...vocabularyInUse(all, list), ...unlistedLabels(all, list, tagVocabulary ?? [])]
  }, [recipes, categories, tagVocabulary])
  const tagChoices = useMemo(
    () => vocabularyInUse(recipes ?? [], tagVocabulary ?? []),
    [recipes, tagVocabulary],
  )

  /**
   * Her labels narrow the POOL; the ingredient marks then rank what is left. That order is
   * the point — "kid approved" is a decision about what she wants to cook, and the pantry
   * question is only interesting once that decision is made.
   */
  const pool = useMemo(() => filterByLabels(recipes ?? [], labels), [recipes, labels])

  const matches = useMemo(
    () => (recipes && registry ? matchPantry(pool, marks, registry) : []),
    [recipes, registry, pool, marks],
  )

  // Once she has said she HAS something, the list is only what uses it. See shortlist().
  const shown = useMemo(() => shortlist(matches), [matches])
  const narrowed = shown.length < matches.length
  const ready = shown.filter((m) => m.missing.length === 0)
  const oneAway = shown.filter((m) => m.missing.length === 1)
  const ruledOut = shown.length - ready.length - oneAway.length

  const byUuid = useMemo(() => new Map((registry ?? []).map((e) => [e.uuid, e])), [registry])

  /*
   * The grid. Searching escapes the tabs entirely: it shows every ingredient by that name
   * in whatever state it is already in, so she can find a thing and change her mind about
   * it from either tab. Otherwise it is what she has marked IN THIS TAB, then the most
   * useful questions — and `nextQuestions` already skips anything marked either way, which
   * is what keeps an ingredient out of the tab it doesn't belong to.
   */
  const tiles = useMemo<IngredientEntry[]>(() => {
    if (!registry) return []
    const q = fold(query)
    if (q) {
      return registry.filter(
        (e) => !e.isStaple && (e.canonical.includes(q) || e.aliases.some((a) => fold(a).includes(q))),
      )
    }
    const answered = Object.keys(marks).flatMap((uuid) => {
      const entry = byUuid.get(uuid)
      return entry && !entry.isStaple && marks[uuid] === tab ? [entry] : []
    })
    // Live candidates: what she might still cook — the recipes actually listed below.
    const live = shown.filter((m) => m.missing.length <= 1)
    return [...answered, ...nextQuestions(live, registry, marks, QUESTIONS)]
  }, [registry, query, marks, shown, byUuid, tab])

  const flipRef = useFlip<HTMLDivElement>(!prefersReducedMotion())

  if (recipes === undefined || registry === undefined) {
    return <Screen header={<ScreenHeader title="What can I make?" />}>{null}</Screen>
  }

  const count = recipes.length
  const labelSummary = [labels.category, ...(labels.tags ?? [])].filter(Boolean).join(' + ')
  // The tally counts what is actually in play. "100 recipes" above a filter line reading
  // "1 of 100" is the app contradicting itself in two adjacent sentences.
  const poolCount = pool.length
  // Say why the list got shorter, and how well it matched — quietly showing 6 where there
  // were 104 is the kind of silence that reads as a bug.
  const picked = Object.values(marks).filter((state) => state === 'have').length
  const using = shown.length > 0 ? shown[0].matched : 0
  const noun = shown.length === 1 ? 'recipe uses' : 'recipes use'
  const marked = Object.keys(marks).length
  const tally = narrowed
    ? `${shown.length} ${noun} ${using === picked ? `all ${picked}` : `${using} of your ${picked}`} · ${ready.length} ready · ${ruledOut} ruled out`
    : marked === 0
      // "104 ready" before she has said anything reads as a claim she can cook 104 things.
      // Nothing is ruled out yet, which is a different statement — so say that instead.
      ? `${poolCount} ${poolCount === 1 ? 'recipe' : 'recipes'} · tap what you have`
      : `${poolCount} ${poolCount === 1 ? 'recipe' : 'recipes'} · ${ready.length} ready · ${ruledOut} ruled out`

  function openRecipe(uuid: string) {
    navigate(`/recipe/${uuid}`, { state: { from: '/dinner' } })
  }

  /**
   * The `+` on a missing chip. A line offering a choice — "lamb or beef" — marks its FIRST
   * option: "I'll pick one up" means one of them, and the printed order is the page's own.
   * Any of the others is still one tap away in the grid.
   */
  function addToHave(choice: Choice) {
    setMark(choice.uuids[0], 'have')
  }

  return (
    <Screen
      header={
        <ScreenHeader
          title="What can I make?"
          action={
            count > 0 ? (
              <Button variant="ghost" onClick={reset}>
                Reset
              </Button>
            ) : undefined
          }
          sub={count > 0 ? <span aria-live="polite">{tally}</span> : undefined}
        />
      }
    >
      {count === 0 ? (
        <div className="px-5 pt-6">
          <EmptyState
            line="Nothing in the box yet. Type in a recipe you already know by heart."
            action={<Button onClick={() => navigate('/edit')}>Add a recipe</Button>}
          />
        </div>
      ) : (
        <>
          {catChoices.length > 0 || tagChoices.length > 0 ? (
            <div className="border-b border-rule px-5 pb-3 pt-3">
              {/*
                Two menus rather than two rows of chips. Categories and tags together run to
                a dozen or more, and this screen is already a grid of ingredients and a list
                of results — laid out flat they would push the answer off the bottom of the
                phone. Closed, they cost one 44px row and still say what is on.
              */}
              <div className="flex gap-2">
                {catChoices.length > 0 ? (
                  <MenuButton
                    label="Category"
                    value={labels.category ?? null}
                    open={menu === 'category'}
                    onTap={() => setMenu(menu === 'category' ? null : 'category')}
                  />
                ) : null}
                {tagChoices.length > 0 ? (
                  <MenuButton
                    label="Tags"
                    value={(labels.tags ?? []).length ? `${(labels.tags ?? []).length} on` : null}
                    open={menu === 'tags'}
                    onTap={() => setMenu(menu === 'tags' ? null : 'tags')}
                  />
                ) : null}
              </div>

              {menu ? (
                <div
                  className="flex flex-wrap gap-2 pt-3"
                  role="group"
                  aria-label={menu === 'category' ? 'Filter by category' : 'Filter by tag'}
                >
                  {(menu === 'category' ? catChoices : tagChoices).map((name) => {
                    const on =
                      menu === 'category'
                        ? labels.category != null && hasCategory([labels.category], name)
                        : hasCategory(labels.tags ?? [], name)
                    return (
                      <Tile
                        key={name}
                        name={name}
                        state={on ? 'have' : 'unknown'}
                        ariaLabel={`${name}, ${on ? 'filtering' : 'not filtering'}`}
                        onTap={() =>
                          menu === 'category' ? pickCategory(name) : toggleTagFilter(name)
                        }
                      />
                    )
                  })}
                </div>
              ) : null}

              {/*
                Never narrow the screen silently. Showing 18 where there were 104, with no
                word about why, is the kind of quiet that reads as a bug.
              */}
              {!labelFilterIsEmpty(labels) ? (
                <div className="flex items-center justify-between gap-3 pt-3">
                  <p className="font-mono text-[11px] text-ink-soft" aria-live="polite">
                    {pool.length} of {count} {count === 1 ? 'recipe' : 'recipes'}
                    {labelSummary ? ` · ${labelSummary}` : ''}
                  </p>
                  <button
                    type="button"
                    onClick={() => updateLabels({ category: null, tags: [] })}
                    className="min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft underline underline-offset-4"
                  >
                    Clear
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="px-5 pb-1 pt-4">
            <SearchField
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="type an ingredient…"
              aria-label="Filter ingredients"
            />
          </div>

          <div className="border-b border-rule px-5 pb-[10px] pt-3">
            <div role="tablist" aria-label="What are you marking?" className="flex">
              {MARK_TABS.map((entry) => {
                const active = tab === entry.state
                return (
                  <button
                    key={entry.state}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => selectTab(entry.state)}
                    className={`min-h-[44px] flex-1 border-b-2 font-mono text-[11px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-thyme ${
                      active ? entry.activeClass : 'border-rule font-normal text-ink-soft'
                    }`}
                  >
                    {entry.label}
                  </button>
                )
              })}
            </div>
            <div
              role="group"
              aria-label={query ? 'Ingredients by name' : MARK_TABS.find((t) => t.state === tab)!.groupLabel}
              className="mt-3 flex flex-wrap gap-2"
            >
              {tiles.map((entry) => (
                <Tile
                  key={entry.uuid}
                  name={entry.canonical}
                  emoji={emojiFor(entry.canonical)}
                  state={marks[entry.uuid] ?? 'unknown'}
                  onTap={() => tapTile(entry.uuid)}
                />
              ))}
              {tiles.length === 0 && query ? (
                <p className="my-[2px] font-mono text-xs text-ink-soft">No ingredient by that name.</p>
              ) : null}
            </div>
          </div>

          <div ref={flipRef} className="relative flex flex-col gap-[22px] px-5 pb-6 pt-[6px]">
            {ready.length > 0 ? (
              <Group label="Ready to cook" matches={ready} onOpen={openRecipe} onAdd={addToHave} />
            ) : null}
            {oneAway.length > 0 ? (
              <Group label="One thing away" matches={oneAway} onOpen={openRecipe} onAdd={addToHave} accent />
            ) : null}

            {ready.length === 0 && oneAway.length === 0 ? (
              <div className="mt-[14px] flex flex-col items-start gap-3 rounded-sm border border-rule bg-card px-5 py-7">
                <p className="font-serif text-[19px] leading-[1.35] text-ink [text-wrap:pretty]">
                  {pool.length === 0
                    ? `Nothing is labelled ${labelSummary}. Clear a filter, or put that label on a recipe.`
                    : narrowed
                      ? 'Nothing you have is one thing away. Un-tap something, or add a recipe.'
                      : 'Nothing matches. Un-tap something, or add a recipe.'}
                </p>
                <Button onClick={reset}>Reset</Button>
              </div>
            ) : null}

            {count < ENOUGH_RECIPES ? (
              <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
                Add more recipes and this gets a lot better.
              </p>
            ) : null}
          </div>
        </>
      )}
    </Screen>
  )
}

/** READY TO COOK · ONE THING AWAY. Recipes two or more away are counted, never listed. */
function Group({
  label,
  matches,
  onOpen,
  onAdd,
  accent = false,
}: {
  label: string
  matches: Match[]
  onOpen: (uuid: string) => void
  onAdd: (choice: Choice) => void
  accent?: boolean
}) {
  return (
    <section className={accent ? '-ml-4 border-l-2 border-leaf pl-[14px]' : ''}>
      <header className="flex items-baseline justify-between gap-[10px] pb-[10px] pt-[14px]">
        <h2
          className={`font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${
            accent ? 'text-thyme' : 'text-ink-soft'
          }`}
        >
          {label}
        </h2>
        <span className="font-mono text-xs text-ink-soft">{matches.length}</span>
      </header>
      <div className="flex flex-col gap-[10px]">
        {matches.map((match) => (
          <ResultCard key={match.recipe.uuid} match={match} onOpen={onOpen} onAdd={onAdd} />
        ))}
      </div>
    </section>
  )
}

function ResultCard({
  match,
  onOpen,
  onAdd,
}: {
  match: Match
  onOpen: (uuid: string) => void
  onAdd: (choice: Choice) => void
}) {
  // `notSure` still ranks this card; it is deliberately not printed. See the file header.
  const { recipe, missing } = match
  return (
    <article data-flip-key={recipe.uuid} className="flex flex-col rounded-sm border border-rule bg-card">
      <button
        type="button"
        onClick={() => onOpen(recipe.uuid)}
        className="flex flex-col items-start gap-[6px] px-[15px] pb-1 pt-[14px] text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-thyme"
      >
        <h3 className="font-serif text-[19px] font-semibold leading-[1.25] text-ink [text-wrap:pretty]">
          {recipe.title}
        </h3>
        <SourceLine citation={recipe.source.citation} page={recipe.source.pageStart} />
      </button>
      {missing.length > 0 ? (
        <div className="flex flex-col gap-1 px-[15px] pb-3">
          <div className="flex flex-wrap items-center gap-[6px]">
              <span className="font-mono text-xs font-semibold text-copper">missing:</span>
              {missing.map((choice) => (
                <button
                  key={choice.label}
                  type="button"
                  onClick={() => onAdd(choice)}
                  aria-label={`add ${choice.primary} to what you have`}
                  className="inline-flex min-h-[44px] items-center gap-[6px] rounded-full bg-copper/10 pl-[11px] pr-[10px] font-mono text-xs font-semibold text-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                >
                  {choice.label}
                  <span aria-hidden="true" className="text-[15px] leading-none opacity-75">
                    +
                  </span>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="pb-2" />
      )}
    </article>
  )
}

/**
 * A closed filter menu: what it filters, and what it is set to. One 44px row whether or not
 * anything is picked, so the controls never push the answer off the screen.
 */
function MenuButton({
  label,
  value,
  open,
  onTap,
}: {
  label: string
  value: string | null
  open: boolean
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-expanded={open}
      aria-label={`${label}: ${value ?? 'any'}`}
      className={`flex min-h-[44px] flex-1 items-center justify-between gap-2 rounded-sm border px-3 font-mono text-[11px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme ${
        value ? 'border-leaf bg-leaf/10 text-thyme' : 'border-rule bg-card text-ink-soft'
      }`}
    >
      <span className="truncate">{value ? `${label} · ${value}` : label}</span>
      <span aria-hidden="true" className="shrink-0 opacity-70">
        {open ? '\u2303' : '\u2304'}
      </span>
    </button>
  )
}
