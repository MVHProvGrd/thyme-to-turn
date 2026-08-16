import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import Screen, { ScreenHeader } from '../components/Screen'
import Button from '../components/Button'
import { useToast } from '../components/Toast'
import { exportBackup, importBackup } from '../db/backup'
import { countRecipes, listIngredients, updateSettings, wipeEverything } from '../db/repo'
import { downloadText, formatBytes } from '../platform/files'
import { now } from '../platform/clock'
import { BackupError } from '../lib/backup-format'

/**
 * Phase 1's Settings is her safety net and nothing else: get the data out, get it back in,
 * and see how much of it there is.
 *
 * Deliberately absent: the API key field. It arrives in phase 4 alongside the photo-parse
 * that uses it — a stored secret with nothing to spend it on is a liability, not a feature.
 * Staples arrive in phase 2 with the dinner screen that reads them.
 */
export default function Settings() {
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const [report, setReport] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<string | null>(null)

  const recipeCount = useLiveQuery(countRecipes, [], undefined)
  const ingredients = useLiveQuery(listIngredients, [], undefined)

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
