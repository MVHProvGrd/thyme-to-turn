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
import { listIngredients, listRecipes } from '../db/repo'
import { emojiFor } from '../lib/emoji'
import { fold } from '../lib/ingredients'
import { matchPantry, nextQuestions } from '../lib/pantry'
import type { IngredientState, Match } from '../lib/pantry'
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
    state: 'dontHave',
    label: 'Don\u2019t have',
    groupLabel: 'Ingredients you are out of',
    activeClass: 'border-copper font-semibold text-copper',
  },
  {
    state: 'have',
    label: 'Have',
    groupLabel: 'Ingredients you have',
    activeClass: 'border-leaf font-semibold text-thyme',
  },
]

const QUESTIONS = 12
const ENOUGH_RECIPES = 15

export default function Dinner() {
  const navigate = useNavigate()
  const recipes = useLiveQuery(listRecipes, [], undefined)
  const registry = useLiveQuery(listIngredients, [], undefined)

  const [marks, setMarks] = useState<Marks>(() => readSession('marks', {}))
  // Which tab is open decides what a tap means. `dontHave` leads: she is answering "what
  // am I out of", which has a three-item answer, where "what do I have" is homework.
  const [tab, setTab] = useState<MarkTab>(() => readSession('markTab', 'dontHave'))
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
    setQuery('')
  }

  const matches = useMemo(
    () => (recipes && registry ? matchPantry(recipes, marks, registry) : []),
    [recipes, registry, marks],
  )

  const ready = matches.filter((m) => m.missing.length === 0)
  const oneAway = matches.filter((m) => m.missing.length === 1)
  const ruledOut = matches.length - ready.length - oneAway.length

  const byUuid = useMemo(() => new Map((registry ?? []).map((e) => [e.uuid, e])), [registry])
  const byCanonical = useMemo(() => new Map((registry ?? []).map((e) => [e.canonical, e])), [registry])

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
    const live = matches.filter((m) => m.missing.length <= 1)
    return [...answered, ...nextQuestions(live, registry, marks, QUESTIONS)]
  }, [registry, query, marks, matches, byUuid, tab])

  const flipRef = useFlip<HTMLDivElement>(!prefersReducedMotion())

  if (recipes === undefined || registry === undefined) {
    return <Screen header={<ScreenHeader title="What can I make?" />}>{null}</Screen>
  }

  const count = recipes.length
  const tally = `${count} ${count === 1 ? 'recipe' : 'recipes'} · ${ready.length} ready · ${ruledOut} ruled out`

  function openRecipe(uuid: string) {
    navigate(`/recipe/${uuid}`, { state: { from: '/dinner' } })
  }

  function addToHave(name: string) {
    const entry = byCanonical.get(name)
    if (entry) setMark(entry.uuid, 'have')
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
                  Nothing matches. Un-tap something, or add a recipe.
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
  onAdd: (name: string) => void
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
  onAdd: (name: string) => void
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
              {missing.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onAdd(name)}
                  aria-label={`add ${name} to what you have`}
                  className="inline-flex min-h-[44px] items-center gap-[6px] rounded-full bg-copper/10 pl-[11px] pr-[10px] font-mono text-xs font-semibold text-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                >
                  {name}
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
