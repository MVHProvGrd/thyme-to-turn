import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Screen, { ScreenHeader } from '../components/Screen'
import Button from '../components/Button'
import Disclosure, { CheckRow } from '../components/Disclosure'
import { useToast } from '../components/Toast'
import { exportBackup, importBackup } from '../db/backup'
import {
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
import { addCategoryToList, listCategories, removeCategoryFromList } from '../db/repo'
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
export default function Settings() {
  const toast = useToast()
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
  // Read once into local state; api/key.ts is the only thing that touches the secret.
  const [apiKey, setApiKeyValue] = useState(() => getApiKey())
  const [stapleQuery, setStapleQuery] = useState('')
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
  const q = fold(stapleQuery)
  const suggestions = q
    ? (ingredients ?? []).filter((entry) => !entry.isStaple && entry.canonical.includes(q))
    : (ingredients ?? []).filter((entry) => !entry.isStaple).slice(0, 10)

  async function addCat() {
    const name = newCategory
    setNewCategory('')
    if (name.trim()) await addCategoryToList(name)
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
    if (!confirm('Remove the starter recipes? Any you have edited stay.')) return
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
    if (!confirm('Delete every recipe on this device? Export first — this cannot be undone.')) return
    if (!confirm('Really delete everything?')) return
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
              when you ask it to read a photo. Around 8 to 9 cents a recipe, so roughly $13 for a
              150-recipe book.
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
