import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Screen, { ScreenHeader } from '../components/Screen'
import Button from '../components/Button'
import Disclosure, { CheckRow } from '../components/Disclosure'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { exportBackup, importBackup } from '../db/backup'
import {
  mergeIngredients,
  unmergeAlias,
  backfillCanonicals,
  addStarterRecipes,
  countRecipes,
  countStarterRecipes,
  getSettings,
  listIngredients,
  removeStarterRecipes,
  addStapleByName,
  setStaple,
  updateSettings,
  wipeEverything,
} from '../db/repo'
import { fold } from '../lib/ingredients'
import { clearApiKey, getApiKey, setApiKey } from '../api/key'
import { PARSE_MODELS, getParseModel, setParseModel, type ParseModelId } from '../api/claude'
import {
  addCategoryToList,
  addTagToList,
  listCategories,
  listTags,
  removeCategoryFromList,
  removeTagFromList,
} from '../db/repo'
import { STARTER_COUNT, loadStarterRecipes } from '../seed'
import { downloadText, formatBytes } from '../platform/files'
import { now } from '../platform/clock'
import { BackupError } from '../lib/backup-format'

/**
 * Settings is her safety net, plus the one knob the dinner screen reads: which ingredients
 * are staples. Everything else — get the data out, get it back in, see how much there is.
 *
 * Deliberately absent: the API key field. It arrives in phase 4 alongside the photo-parse
 * that uses it — a stored secret with nothing to spend it on is a liability, not a feature.
 */
/**
 * What a tap on an ingredient does. Two different actions on the same list, so she picks
 * which one is armed rather than the app guessing from a single tap.
 */
const MERGE_MODES: { mode: 'fold' | 'inspect'; label: string }[] = [
  { mode: 'fold', label: 'Fold together' },
  { mode: 'inspect', label: 'Look inside' },
]

/** Rows of the ingredient list per "show more". Enough to scan, short enough to load. */
const MERGE_PAGE = 25

export default function Settings() {
  const toast = useToast()
  const ask = useConfirm()
  const fileInput = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<string | null>(null)

  const recipeCount = useLiveQuery(countRecipes, [], undefined)
  const starterCount = useLiveQuery(countStarterRecipes, [], undefined)
  const ingredients = useLiveQuery(listIngredients, [], undefined)
  const [busy, setBusy] = useState(false)
  const categories = useLiveQuery(listCategories, [], undefined)
  const settings = useLiveQuery(getSettings, [], undefined)
  const unitPreference = settings?.unitPreference ?? 'as-written'
  const [newCategory, setNewCategory] = useState('')
  const tags = useLiveQuery(listTags, [], undefined)
  const [newTag, setNewTag] = useState('')
  // Read once into local state; api/key.ts is the only thing that touches the secret.
  const [apiKey, setApiKeyValue] = useState(() => getApiKey())
  const [parseModel, setParseModelValue] = useState<ParseModelId>(() => getParseModel())
  const [stapleQuery, setStapleQuery] = useState('')
  const [mergeQuery, setMergeQuery] = useState('')
  /** The entry she picked first: the one that will be folded away. */
  const [mergeFrom, setMergeFrom] = useState<string | null>(null)
  /**
   * What a tap on an ingredient DOES. Folding needs two taps in a row and rewrites
   * pointers; looking inside needs one and changes nothing. Guessing which she meant from a
   * single tap is how you fold two things together by accident, so she says which first.
   */
  const [mergeMode, setMergeMode] = useState<'fold' | 'inspect'>('fold')
  /** The entry whose folded-in spellings are open, in "look inside" mode. */
  const [openEntry, setOpenEntry] = useState<string | null>(null)
  /** How much of the ingredient list is on screen. Grows; never silently truncates. */
  const [mergeShown, setMergeShown] = useState(MERGE_PAGE)
  const [newStaple, setNewStaple] = useState('')

  /**
   * Re-derive the match keys for recipes already saved. A better normalizer only helps
   * recipes written after it, so without this her existing collection keeps whatever the
   * old rule produced -- including lines that matched nothing at all.
   */
  async function doRecheckMatching() {
    setBusy(true)
    try {
      const report = await backfillCanonicals()
      if (report.recipesChanged === 0) {
        toast('Nothing to fix -- every recipe already matches properly.')
      } else {
        const recovered = report.ingredientsRecovered
        toast(
          recovered > 0
            ? `Fixed ${report.recipesChanged} recipes. ${recovered} ingredients can be matched now.`
            : `Updated ${report.recipesChanged} recipes.`,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  /**
   * Two taps: the spelling to fold away, then the one to keep. Never automatic -- `pepper`
   * is not `bell pepper`, and a merge the app guessed would make the dinner screen quietly
   * wrong.
   */
  async function doMerge(intoUuid: string) {
    const fromUuid = mergeFrom
    if (!fromUuid || fromUuid === intoUuid) return
    const rows = ingredients ?? []
    const from = rows.find((row) => row.uuid === fromUuid)
    const into = rows.find((row) => row.uuid === intoUuid)
    if (!from || !into) return
    const ok = await ask({
      title: `Treat "${from.canonical}" as "${into.canonical}"?`,
      body: `Every recipe that says "${from.canonical}" will point at "${into.canonical}" from now on. Your printed lines are untouched, and you can take it back out from "Look inside".`,
      confirmLabel: 'Fold together',
    })
    if (!ok) return

    const result = await mergeIngredients(fromUuid, intoUuid)
    setMergeFrom(null)
    if (!result) return
    toast(
      result.recipesRepointed === 1
        ? `Merged. 1 recipe now uses "${into.canonical}".`
        : `Merged. ${result.recipesRepointed} recipes now use "${into.canonical}".`,
    )
  }

  /**
   * Take one spelling back out. The undo for a fold, and the reason a fold is safe to try:
   * recipes that actually spell it the old way go back to their own entry, and ones that
   * never did stay put. No confirm — nothing is lost, and re-folding is two taps away.
   */
  async function doUnmerge(uuid: string, alias: string) {
    const result = await unmergeAlias(uuid, alias)
    if (!result) return
    toast(
      result.recipesRepointed === 0
        ? `"${alias}" is its own ingredient again. No recipe was spelling it that way.`
        : result.recipesRepointed === 1
          ? `"${alias}" is its own ingredient again. 1 recipe went back to it.`
          : `"${alias}" is its own ingredient again. ${result.recipesRepointed} recipes went back to it.`,
    )
  }

  /** Switching what a tap means always clears whatever the other mode had half-started. */
  function selectMergeMode(mode: 'fold' | 'inspect') {
    setMergeMode(mode)
    setMergeFrom(null)
    setOpenEntry(null)
  }

  async function addStaple() {
    const name = newStaple
    setNewStaple('')
    if (name.trim()) await addStapleByName(name)
  }

  /*
   * A registry with a hundred recipes in it runs to hundreds of entries, and showing them
   * all was a wall. So: her staples always, then the ingredients that turn up most often,
   * and a search for anything else.
   */
  const staples = (ingredients ?? []).filter((entry) => entry.isStaple)
  /**
   * Every ingredient she has, in ALPHABETICAL order — not by how often each turns up.
   *
   * Usage order was wrong for this list twice over. It buried the whole registry behind a
   * silent cap of twelve, which looked like the complete list rather than the top of one
   * (Alisa, 2026-08-16: "there does not appear to be a way to scroll through"). And it put
   * `chicken broth` and `chicken stock` a hundred rows apart, when the entire job of this
   * screen is noticing that they are the same thing. Alphabetical stands them next to each
   * other.
   *
   * Paged rather than scrolled: a scrolling box inside a page fights the phone's own
   * scroll. "Show more" grows the list downward, which does not.
   */
  const mergeQ = fold(mergeQuery.trim())
  const mergeMatches = (ingredients ?? [])
    .filter((entry) => !mergeQ || entry.canonical.includes(mergeQ) || entry.aliases.some((a) => fold(a).includes(mergeQ)))
    .slice()
    .sort((a, b) => a.canonical.localeCompare(b.canonical))
  const mergeCandidates = mergeMatches.slice(0, mergeShown)
  const q = fold(stapleQuery)
  const suggestions = q
    ? (ingredients ?? []).filter((entry) => !entry.isStaple && entry.canonical.includes(q))
    : (ingredients ?? []).filter((entry) => !entry.isStaple).slice(0, 10)

  /**
   * A name lives in one vocabulary or the other, never both — otherwise it would sit in
   * two filter menus that mean different things and land in the same place on the recipe.
   * The clash is said out loud rather than swallowed.
   */
  async function addCat() {
    const name = newCategory
    if (!name.trim()) return
    setNewCategory('')
    const { clash } = await addCategoryToList(name)
    if (clash) toast(`"${name.trim()}" is already a tag. A name can be one or the other.`)
  }

  async function addTag() {
    const name = newTag
    if (!name.trim()) return
    setNewTag('')
    const { clash } = await addTagToList(name)
    if (clash) toast(`"${name.trim()}" is already a category. A name can be one or the other.`)
  }

  async function doAddStarters() {
    setBusy(true)
    try {
      const { added, skipped } = await addStarterRecipes(await loadStarterRecipes())
      toast(added ? `Added ${added} starter ${added === 1 ? 'recipe' : 'recipes'}.` : 'Already here.')
      if (added && skipped) setReport([`${added} new, ${skipped} already present.`])
    } finally {
      setBusy(false)
    }
  }

  async function doRemoveStarters() {
    const ok = await ask({
      title: 'Remove the starter recipes?',
      body: 'Any you have edited are yours now and stay. Nothing else on this phone is touched.',
      confirmLabel: 'Remove them',
      destructive: true,
    })
    if (!ok) return
    const removed = await removeStarterRecipes()
    toast(removed ? `Removed ${removed}.` : 'Nothing to remove.')
  }

  async function doExport() {
    const { filename, text } = await exportBackup()
    downloadText(filename, text)
    await updateSettings({ lastExportAt: now() })
    toast('Exported.')
  }

  async function doImport(file: File) {
    setError(null)
    setReport(null)
    try {
      const result = await importBackup(await file.text())
      setReport(result.lines)
      toast('Imported.')
    } catch (caught) {
      // Say what happened and what to do. Never "Something went wrong".
      setError(caught instanceof BackupError ? caught.message : "That file couldn't be read.")
    }
  }

  async function doWipe() {
    const ok = await ask({
      title: 'Delete everything on this phone?',
      body: 'Every recipe, book, photo and ingredient. There is no server and no other copy — if you have not exported, this cannot be undone.',
      confirmLabel: 'Delete everything',
      destructive: true,
    })
    if (!ok) return
    // Two gates on purpose. This is the one action in the app with nothing behind it.
    const reallyOk = await ask({
      title: 'Last chance.',
      body: 'Tap Cancel and use Export as JSON first if there is any doubt at all.',
      confirmLabel: 'Yes, delete it all',
      destructive: true,
    })
    if (!reallyOk) return
    await wipeEverything()
    toast('Deleted everything.')
  }

  async function checkUsage() {
    const estimate = await navigator.storage?.estimate?.()
    setUsage(estimate?.usage ? formatBytes(estimate.usage) : 'not available on this browser')
  }

  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <div className="flex flex-col gap-7 px-5 pb-10 pt-5">
        <p className="rounded-sm border border-rule border-l-2 border-l-leaf bg-card px-[14px] py-[13px] font-mono text-[11px] leading-[1.6] text-ink-soft">
          Everything works offline and stays on this phone. The key below is the one exception,
          and it is only used to read a page you photograph.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            Claude API key
          </h2>
          <div className="flex flex-col gap-[6px]">
            <input
              value={apiKey}
              onChange={(event) => {
                setApiKeyValue(event.target.value)
                setApiKey(event.target.value)
              }}
              placeholder="paste your key"
              aria-label="Claude API key"
              autoComplete="off"
              spellCheck={false}
              className="min-h-[48px] w-full rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            />
            <p
              className={`font-mono text-[11px] leading-[1.6] ${
                apiKey.trim().length > 8 ? 'text-thyme' : 'text-ink-soft'
              }`}
            >
              {apiKey.trim().length > 8
                ? 'Key stored on this device.'
                : 'No key yet. Photo-parse stays off until there is one.'}
            </p>
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              It stays in this browser, never goes into a backup, and is only sent to Anthropic
              when you ask it to read a photo.
            </p>
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              A key comes from a separate developer account at console.anthropic.com, with its own
              billing. A Claude subscription does not include one. If you would rather not set that
              up, the photograph screen can send pages to whichever assistant you already pay for,
              which needs no key and costs nothing per recipe.
            </p>
          </div>
          {apiKey ? (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => {
                clearApiKey()
                setApiKeyValue('')
                toast('Key removed.')
              }}
            >
              Remove the key
            </Button>
          ) : null}

          {/*
            The price knob. Left visible even without a key, because "what would this cost
            me?" is the question you ask BEFORE going and setting up billing.
          */}
          <div className="flex flex-col gap-1 pt-1">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              How carefully it reads
            </h3>
            {PARSE_MODELS.map((option) => (
              <label key={option.id} className="flex cursor-pointer items-start gap-3 py-[6px]">
                <input
                  type="radio"
                  name="parse-model"
                  checked={parseModel === option.id}
                  onChange={() => {
                    setParseModel(option.id)
                    setParseModelValue(option.id)
                  }}
                  className="mt-[3px] h-[18px] w-[18px] shrink-0 accent-thyme"
                />
                <span className="flex flex-col gap-[2px]">
                  <span className="font-mono text-[13px] text-ink">
                    {option.label} — {option.cost}
                  </span>
                  <span className="font-mono text-[11px] leading-[1.6] text-ink-soft">
                    {option.blurb}
                  </span>
                </span>
              </label>
            ))}
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              You can switch at any time, and a recipe that came back wrong can be read again on
              the careful setting from its own screen.
            </p>
          </div>
        </section>

        <Disclosure title="Amounts" note={UNIT_LABELS[unitPreference]}>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            How quantities are shown. This only changes the display — the line as printed is
            kept exactly as it was, so nothing is lost in a conversion. Cups and grams are never
            swapped for each other: that would need to know what the ingredient weighs.
          </p>
          <div className="flex flex-col">
            {(['as-written', 'metric', 'imperial'] as const).map((option) => (
              <label key={option} className="flex min-h-[44px] cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="units"
                  checked={unitPreference === option}
                  onChange={() => void updateSettings({ unitPreference: option })}
                  className="h-[18px] w-[18px] shrink-0 accent-thyme"
                />
                <span className="font-mono text-[13px] text-ink">{UNIT_LABELS[option]}</span>
              </label>
            ))}
          </div>
        </Disclosure>

        <Disclosure title="Staples" note={`${staples.length} always in`}>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            Things that are always in the cupboard. The dinner screen never asks about a staple
            and never counts one as missing — so a wrong one here gives a confidently wrong
            answer there.
          </p>

          {staples.length > 0 ? (
            <div className="flex flex-col" role="group" aria-label="Your staples">
              {staples.map((entry) => (
                <CheckRow
                  key={entry.uuid}
                  label={entry.canonical}
                  checked
                  onChange={() => void setStaple(entry.uuid, false)}
                />
              ))}
            </div>
          ) : (
            <p className="font-mono text-[11px] text-ink-soft">Nothing marked yet.</p>
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={newStaple}
              onChange={(event) => setNewStaple(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addStaple()
                }
              }}
              placeholder="add one of your own"
              aria-label="New staple"
              className="min-h-[48px] rounded-sm border border-rule bg-paper px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            />
            <Button variant="secondary" onClick={() => void addStaple()}>
              Add
            </Button>
          </div>

          <input
            type="search"
            value={stapleQuery}
            onChange={(event) => setStapleQuery(event.target.value)}
            placeholder="search your ingredients…"
            aria-label="Search ingredients"
            className="min-h-[44px] w-full rounded-sm border border-rule bg-paper px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
          />
          <div className="flex flex-col" role="group" aria-label="Ingredients you could mark">
            {suggestions.map((entry) => (
              <CheckRow
                key={entry.uuid}
                label={entry.canonical}
                checked={false}
                hint={entry.seenCount > 0 ? `${entry.seenCount}` : undefined}
                onChange={() => void setStaple(entry.uuid, true)}
              />
            ))}
            {suggestions.length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">
                {stapleQuery ? 'Nothing by that name.' : 'Ingredients show up here as you add recipes.'}
              </p>
            ) : null}
          </div>
          {!stapleQuery && (ingredients?.length ?? 0) > staples.length + 10 ? (
            <p className="font-mono text-[11px] text-ink-soft">
              Showing the ten most used. Search for anything else.
            </p>
          ) : null}
        </Disclosure>

        <Disclosure title="Duplicate ingredients" note={`${(ingredients ?? []).length} known`}>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            A hundred recipes turn one thing into four: chicken stock, chicken broth, homemade
            chicken stock. The dinner screen then asks about the same ingredient four times.
            Tap the spelling you want to fold away, then the one to keep. Your recipes are not
            changed — they just point at the one entry afterwards, and the old spelling keeps
            working. Changed your mind? Switch to "look inside" and take it back out.
          </p>
          <div role="tablist" aria-label="What a tap does" className="flex">
            {MERGE_MODES.map((entry) => {
              const active = mergeMode === entry.mode
              return (
                <button
                  key={entry.mode}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectMergeMode(entry.mode)}
                  className={`min-h-[44px] flex-1 border-b-2 font-mono text-[11px] uppercase tracking-[0.08em] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-thyme ${
                    active
                      ? 'border-leaf font-semibold text-thyme'
                      : 'border-rule font-normal text-ink-soft'
                  }`}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>

          <p
            className={`font-mono text-[11px] leading-[1.6] ${
              mergeMode === 'fold' ? 'text-copper' : 'text-ink-soft'
            }`}
          >
            {mergeMode === 'inspect'
              ? 'Tap an ingredient to see the spellings folded into it. Nothing changes until you take one out.'
              : mergeFrom
                ? `Now tap the one to KEEP. "${
                    (ingredients ?? []).find((row) => row.uuid === mergeFrom)?.canonical ?? ''
                  }" will fold into it — or tap it again to cancel.`
                : 'Nothing picked yet.'}
          </p>

          <input
            type="search"
            value={mergeQuery}
            onChange={(event) => {
              setMergeQuery(event.target.value)
              setMergeShown(MERGE_PAGE)
              setOpenEntry(null)
            }}
            placeholder="search your ingredients…"
            aria-label="Search ingredients to merge"
            className="min-h-[44px] w-full rounded-sm border border-rule bg-paper px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
          />

          <div className="flex flex-col" role="group" aria-label="Your ingredients">
            {mergeCandidates.map((entry) => {
              const open = mergeMode === 'inspect' && openEntry === entry.uuid
              return (
                <div key={entry.uuid} className="border-b border-rule">
                  <button
                    type="button"
                    onClick={() => {
                      if (mergeMode === 'inspect') {
                        setOpenEntry(open ? null : entry.uuid)
                      } else if (entry.uuid === mergeFrom) {
                        // Tapping the picked one again puts it back. The tap that undoes a
                        // selection should be the same tap that made it — anything else and
                        // the only way out is a Cancel button somewhere below the fold.
                        setMergeFrom(null)
                      } else if (mergeFrom) {
                        void doMerge(entry.uuid)
                      } else {
                        setMergeFrom(entry.uuid)
                      }
                    }}
                    aria-expanded={mergeMode === 'inspect' ? open : undefined}
                    aria-label={
                      entry.uuid === mergeFrom
                        ? `${entry.canonical}, picked to fold away. Tap again to cancel.`
                        : entry.aliases.length
                          ? `${entry.canonical}, ${entry.aliases.length} folded in`
                          : `${entry.canonical}, nothing folded in`
                    }
                    className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-1 text-left font-mono text-[13px] ${
                      entry.uuid === mergeFrom ? 'text-copper' : 'text-ink'
                    }`}
                  >
                    <span>{entry.canonical}</span>
                    {/*
                      The count is how many spellings are folded IN, not how often the
                      ingredient turns up — this list is for tidying, and that is the only
                      number with anything to do with tidying. Nothing folded in, no number:
                      a column of "0"s is noise, and the rows with something inside are
                      exactly the ones worth spotting.
                    */}
                    {entry.aliases.length ? (
                      <span className="shrink-0 font-mono text-[11px] text-thyme">
                        +{entry.aliases.length}
                      </span>
                    ) : null}
                  </button>

                  {open ? (
                    <div className="flex flex-col gap-2 pb-3 pl-1 pr-1 pt-1">
                      {entry.aliases.length === 0 ? (
                        <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
                          Nothing folded in. This is the only spelling of it.
                        </p>
                      ) : (
                        <>
                          <p className="font-mono text-[11px] text-ink-soft">
                            Also counts as — tap × to make one its own ingredient again:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {entry.aliases.map((alias) => (
                              <button
                                key={alias}
                                type="button"
                                onClick={() => void doUnmerge(entry.uuid, alias)}
                                aria-label={`take "${alias}" back out of ${entry.canonical}`}
                                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-rule bg-card pl-[11px] pr-[10px] font-mono text-xs text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                              >
                                {alias}
                                <span aria-hidden="true" className="text-[15px] leading-none text-copper">
                                  ×
                                </span>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
            {mergeCandidates.length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">
                {mergeQ ? 'No ingredient by that name.' : 'Nothing here yet.'}
              </p>
            ) : null}
          </div>

          {/*
            Say what is on screen and what is not. A list that stops at twenty-five without
            saying so reads as the whole registry, which is how she came to think there was
            no way to scroll it.
          */}
          {mergeMatches.length > mergeCandidates.length ? (
            <>
              <p className="font-mono text-[11px] text-ink-soft">
                Showing {mergeCandidates.length} of {mergeMatches.length}, A–Z.
              </p>
              <Button
                variant="secondary"
                onClick={() => setMergeShown((shown) => shown + MERGE_PAGE * 2)}
              >
                Show more
              </Button>
            </>
          ) : mergeMatches.length > MERGE_PAGE ? (
            <p className="font-mono text-[11px] text-ink-soft">
              All {mergeMatches.length}, A–Z.
            </p>
          ) : null}

          {mergeFrom ? (
            <Button variant="secondary" onClick={() => setMergeFrom(null)}>
              Cancel
            </Button>
          ) : null}
        </Disclosure>

        <Disclosure title="Categories" note={`${(categories ?? []).length}`}>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            Breakfast, soup, dessert — or anything you like. Put a recipe in one while you type it
            in, then search by it. Removing one here never removes it from a recipe.
          </p>

          <div className="flex flex-col gap-2">
            {(categories ?? []).map((name) => (
              <div key={name} className="grid grid-cols-[1fr_44px] gap-2">
                <span className="flex min-h-[44px] items-center rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink">
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => void removeCategoryFromList(name)}
                  aria-label={`Remove the ${name} category`}
                  className="min-h-[44px] rounded-sm border border-rule text-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                >
                  −
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addCat()
                }
              }}
              placeholder="Sunday lunch"
              aria-label="New category"
              className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            />
            <Button variant="secondary" onClick={() => void addCat()}>
              Add
            </Button>
          </div>
        </Disclosure>

        <Disclosure title="Tags" note={`${(tags ?? []).length}`}>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            Not what kind of meal it is — what it's <em>like</em>. Kid approved, easy, girl
            dinner. A recipe can carry as many as fit, and Plan a meal can narrow by them.
            Removing one here never removes it from a recipe.
          </p>

          <div className="flex flex-col gap-2">
            {(tags ?? []).map((name) => (
              <div key={name} className="grid grid-cols-[1fr_44px] gap-2">
                <span className="flex min-h-[44px] items-center rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink">
                  {name}
                </span>
                <button
                  type="button"
                  onClick={() => void removeTagFromList(name)}
                  aria-label={`Remove the ${name} tag`}
                  className="min-h-[44px] rounded-sm border border-rule text-copper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                >
                  −
                </button>
              </div>
            ))}
            {(tags ?? []).length === 0 ? (
              <p className="font-mono text-[11px] text-ink-soft">No tags yet. Add one below.</p>
            ) : null}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={newTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void addTag()
                }
              }}
              placeholder="Kid approved"
              aria-label="New tag"
              className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            />
            <Button variant="secondary" onClick={() => void addTag()}>
              Add
            </Button>
          </div>
        </Disclosure>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Starter recipes</h2>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            {STARTER_COUNT} everyday recipes from the Wikibooks Cookbook (CC BY-SA), so the dinner
            screen has something to chew on before your own books are in. Each one says where it
            came from. Edit one and it becomes yours; the rest can be removed any time.
            {starterCount ? ` ${starterCount} on this phone now.` : ''}
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void doAddStarters()}>
            {busy ? 'Adding…' : `Add ${STARTER_COUNT} starter recipes`}
          </Button>
          {starterCount ? (
            <Button variant="destructive" onClick={() => void doRemoveStarters()}>
              Remove starter recipes
            </Button>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            Ingredient matching
          </h2>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            The dinner screen matches on a tidied-up version of each ingredient line, worked out
            when the recipe was saved. When that tidying improves, older recipes keep the old
            result until you run this. It only touches the matching, never your recipes --
            the printed lines, notes and everything else stay exactly as they are.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void doRecheckMatching()}>
            {busy ? 'Checking…' : 'Re-check ingredient matching'}
          </Button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Library</h2>
          <p className="font-mono text-xs leading-[1.7] text-ink-soft">
            {recipeCount ?? 0} {recipeCount === 1 ? 'recipe' : 'recipes'} ·{' '}
            {ingredients?.length ?? 0} ingredients known
            {usage ? ` · ${usage} used` : ''}
          </p>

          <Button onClick={() => void doExport()}>Export as JSON</Button>

          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            Import a backup
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void doImport(file)
            }}
          />

          <button
            type="button"
            onClick={() => void checkUsage()}
            className="min-h-[44px] self-start font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft underline underline-offset-4"
          >
            Check storage used
          </button>

          {report ? (
            <div className="rounded-sm border border-rule bg-card px-[14px] py-[13px]">
              {report.map((line) => (
                <p key={line} className="font-mono text-[11px] leading-[1.6] text-ink-soft">
                  {line}
                </p>
              ))}
            </div>
          ) : null}

          {error ? (
            <p className="rounded-sm border border-copper/45 px-[14px] py-[13px] font-mono text-[11px] leading-[1.6] text-copper">
              {error}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Danger</h2>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            Export first. There is no undo and no copy anywhere else.
          </p>
          <Button variant="destructive" onClick={() => void doWipe()}>
            Delete everything
          </Button>
        </section>
      </div>
    </Screen>
  )
}

/** Named so the closed row says something: "Amounts · as printed" beats "Amounts ›". */
const UNIT_LABELS: Record<'as-written' | 'metric' | 'imperial', string> = {
  'as-written': 'as printed',
  metric: 'metric',
  imperial: 'cups & ounces',
}
