import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Screen, { ScreenHeader } from '../components/Screen'
import Button from '../components/Button'
import Tile from '../components/Tile'
import { useToast } from '../components/Toast'
import { exportBackup, importBackup } from '../db/backup'
import {
  addStarterRecipes,
  countRecipes,
  countStarterRecipes,
  listIngredients,
  removeStarterRecipes,
  setStaple,
  updateSettings,
  wipeEverything,
} from '../db/repo'
import { emojiFor } from '../lib/emoji'
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
          Everything works offline and stays on this phone. Nothing is uploaded anywhere.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            Staples — never counted as missing
          </h2>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            Things that are always in the cupboard. The dinner screen never asks about a staple
            and never counts one as missing or not sure — so a wrong one here gives a confidently
            wrong answer there.
          </p>
          {ingredients && ingredients.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Staples">
              {staplesFirst(ingredients).map((entry) => (
                <Tile
                  key={entry.uuid}
                  name={entry.canonical}
                  emoji={emojiFor(entry.canonical)}
                  state={entry.isStaple ? 'have' : 'unknown'}
                  ariaLabel={`${entry.canonical}, ${entry.isStaple ? 'a staple' : 'not a staple'}`}
                  onTap={() => void setStaple(entry.uuid, !entry.isStaple)}
                />
              ))}
            </div>
          ) : (
            <p className="font-mono text-xs text-ink-soft">
              Ingredients show up here as you add recipes.
            </p>
          )}
        </section>

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

/** Staples first so she can see the list she's trusting; the rest by how often they turn up. */
function staplesFirst<T extends { isStaple: boolean }>(entries: T[]): T[] {
  return [...entries.filter((e) => e.isStaple), ...entries.filter((e) => !e.isStaple)]
}
