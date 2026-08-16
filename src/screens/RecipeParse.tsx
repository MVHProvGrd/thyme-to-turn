import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import PageBox from '../components/PageBox'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { ParseError, parseRecipePhotos } from '../api/claude'
import { hasApiKey } from '../api/key'
import { BRING_YOUR_OWN_AI_PROMPT } from '../api/prompts'
import { savePhoto, saveRecipe } from '../db/repo'
import { PastedParseError, readPastedParse } from '../lib/pasted-parse'
import { findTextBox, prepareImage } from '../platform/camera'
import type { CropRect } from '../lib/types'
import { copyText } from '../platform/clipboard'
import { downloadBlob } from '../platform/files'
import { shareFiles } from '../platform/share'

/**
 * Photograph a page, get a filled-in form.
 *
 * ★ THE VERIFICATION GATE. Nothing here writes a parsed recipe. The result is handed to
 * the edit screen in navigation state and only exists once she presses Save — because a
 * confident, wrong parse is worse than no parse, and she'd find out while creaming the
 * butter. `db/repo.ts` is still the only writer.
 *
 * Multi-photo from the start: recipes span a spread and the ingredients are often on the
 * facing page. All the images go in one request as ONE recipe.
 *
 * When the parse can't happen — offline, key rejected, Claude busy — the photos are not
 * lost. "Keep the photos" saves an unverified recipe with the pages attached, and the
 * recipe screen offers to read them whenever she has signal. That is the queue, without a
 * new table: an unverified recipe carrying page photos IS a pending parse.
 */
/**
 * A photographed page. `crop` is the box she drew around the recipe: it decides what gets
 * SENT, never what gets stored. The whole page is kept because it is the only record of
 * what the page said when a parse turns out wrong.
 */
type Shot = { blob: Blob; width: number; height: number; crop?: CropRect }

export default function RecipeParse() {
  const navigate = useNavigate()
  const toast = useToast()
  const ask = useConfirm()
  const fileInput = useRef<HTMLInputElement>(null)

  const [shots, setShots] = useState<Shot[]>([])
  const [working, setWorking] = useState<string | null>(null)
  const [error, setError] = useState<ParseError | null>(null)
  const [pasted, setPasted] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)

  /**
   * The bring-your-own-AI path. She uses whichever assistant she already pays for, and the
   * answer lands in exactly the same verification gate — no key, no per-recipe cost, and
   * still nothing written until she presses Save.
   */
  async function readPastedReply() {
    setPasteError(null)
    try {
      const parsed = readPastedParse(pasted)
      const photos = shots.length
        ? await Promise.all(
            shots.map((shot) => savePhoto(shot.blob, 'page', { width: shot.width, height: shot.height })),
          )
        : []
      navigate('/edit', { state: { parsed, photos } })
    } catch (caught) {
      setPasteError(caught instanceof PastedParseError ? caught.message : "That didn't read as a recipe.")
    }
  }

  /**
   * The pages as shareable files, kept ready ahead of the tap.
   *
   * iOS refuses a share sheet that arrives after an await it did not see the user start,
   * so the cropping has to be finished BEFORE she presses the button, not during it.
   */
  const [pages, setPages] = useState<File[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (shots.length === 0) {
        setPages([])
        return
      }
      try {
        const files = await Promise.all(
          shots.map(async (shot, index) => {
            const blob = shot.crop ? (await prepareImage(shot.blob, shot.crop)).blob : shot.blob
            return new File([blob], `page-${index + 1}.jpg`, { type: 'image/jpeg' })
          }),
        )
        if (!cancelled) setPages(files)
      } catch {
        if (!cancelled) setPages([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shots])

  /** Re-box one page on request, for when she has reset it or the first guess was wrong. */
  async function findText(index: number) {
    const shot = shots[index]
    if (!shot) return
    const crop = await findTextBox(shot.blob)
    if (!crop) {
      toast("Couldn't pick out the text -- drag a box around it.")
      return
    }
    setShots((current) => current.map((item, i) => (i === index ? { ...item, crop } : item)))
  }

  /**
   * Hand the boxed pages and the instructions to whichever assistant she picks from the
   * system share sheet. This is the missing half of the bring-your-own-AI path: a photo
   * taken in the app never reached her camera roll, so "give it your photo" was advice she
   * could not follow.
   *
   * Where the browser cannot share files (desktop, mostly) it copies the instructions and
   * saves the pages instead, so the path still works -- it just takes her two more taps.
   */
  async function sendToAI() {
    if (pages.length === 0) return
    const result = await shareFiles(pages, BRING_YOUR_OWN_AI_PROMPT, 'Recipe page')
    if (result === 'shared') {
      toast('Sent. Paste its reply back here when it answers.')
      return
    }
    if (result === 'cancelled') return
    const copied = await copyText(BRING_YOUR_OWN_AI_PROMPT)
    for (const page of pages) downloadBlob(page.name, page)
    toast(
      copied
        ? 'Instructions copied and pages saved. Attach them to your assistant.'
        : 'Pages saved. Copy the instructions by hand and attach them.',
    )
  }

  /**
   * The tab bar reaches every screen now, so leaving is one tap. Photographed pages live
   * only in this component until she saves or keeps them, and a pasted reply is work she
   * did in another app — neither should vanish to a stray thumb.
   */
  async function confirmLeave(): Promise<boolean> {
    const leaving = { confirmLabel: 'Leave', cancelLabel: 'Stay here', destructive: true } as const
    if (working) {
      return ask({ title: 'Leave now?', body: 'The page is still being read.', ...leaving })
    }
    if (pasted.trim()) {
      return ask({
        title: 'Leave without using the reply you pasted?',
        body: 'It has not been read into a recipe yet, and nothing here is saved.',
        ...leaving,
      })
    }
    if (shots.length > 0) {
      return ask({
        title:
          shots.length === 1
            ? 'Leave without keeping the page you photographed?'
            : `Leave without keeping the ${shots.length} pages you photographed?`,
        body: 'The photos live only on this screen until a recipe is saved.',
        ...leaving,
      })
    }
    return true
  }

  async function addFiles(files: File[]) {
    setError(null)
    setWorking('Getting the photos ready…')
    try {
      const prepared: Shot[] = []
      for (const file of files) {
        const image = await prepareImage(file)
        // Box the print straight away. It is only a suggestion -- "Whole page" undoes it,
        // and it saves her drawing the same rectangle by hand on every single page.
        const crop = await findTextBox(image.blob)
        prepared.push({ blob: image.blob, width: image.width, height: image.height, crop })
      }
      setShots((current) => [...current, ...prepared])
    } catch {
      setError(new ParseError('bad-response', "One of those photos couldn't be read. Try again."))
    } finally {
      setWorking(null)
    }
  }

  async function read() {
    setError(null)
    setWorking('Reading the page…')
    try {
      // Send only the boxed region — it parses better and costs roughly half the tokens.
      const images = await Promise.all(
        shots.map(async (shot) => ({
          base64: await toBase64(shot.crop ? (await prepareImage(shot.blob, shot.crop)).blob : shot.blob),
          mediaType: 'image/jpeg' as const,
        })),
      )
      const parsed = await parseRecipePhotos(images)
      // Store the WHOLE page, with the box recorded alongside it rather than baked in.
      const photos = await Promise.all(
        shots.map((shot) =>
          savePhoto(shot.blob, 'page', { width: shot.width, height: shot.height }, shot.crop),
        ),
      )
      navigate('/edit', { state: { parsed, photos } })
    } catch (caught) {
      setError(caught instanceof ParseError ? caught : new ParseError('bad-response', 'That did not work.'))
    } finally {
      setWorking(null)
    }
  }

  /** Never lose the photographs because the network was down. */
  async function keepPhotos() {
    setWorking('Saving the photos…')
    try {
      const photos = await Promise.all(
        shots.map((shot) =>
          savePhoto(shot.blob, 'page', { width: shot.width, height: shot.height }, shot.crop),
        ),
      )
      const recipe = await saveRecipe(
        { title: '', source: { kind: 'book' }, ingredients: [], steps: [], photos },
        { verified: false },
      )
      toast('Photos saved — read them when you have signal.')
      navigate(`/recipe/${recipe.uuid}`, { replace: true })
    } finally {
      setWorking(null)
    }
  }

  return (
    <Screen
      header={
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate('/recipes')}
            className="min-h-[44px] font-mono text-xs text-ink-soft"
          >
            ← Cancel
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            Photograph a page
          </span>
          <span className="min-w-[44px]" />
        </div>
      }
      onLeave={confirmLeave}
    >
      <div className="flex flex-col gap-[18px] px-5 pb-10 pt-5">
        {!hasApiKey() ? (
          <div className="rounded-sm border border-rule border-l-2 border-l-leaf bg-card px-[14px] py-[13px]">
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              No API key, so this app can't read the photo itself. Photograph the page anyway and
              send it to an AI you already have, below — or add a key in Settings.
            </p>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="mt-2 min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-thyme underline underline-offset-4"
            >
              Open Settings
            </button>
          </div>
        ) : null}

        <p className="font-mono text-xs leading-[1.7] text-ink-soft">
          Photograph the whole recipe. If it runs over two pages, take both — they're read together
          as one recipe. Nothing is saved until you've checked it.
        </p>

        {shots.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {shots.map((shot, index) => (
              <li key={index} className="flex flex-col gap-2">
                <PageBox
                  blob={shot.blob}
                  crop={shot.crop}
                  onFindText={() => void findText(index)}
                  label={`Page ${index + 1}`}
                  onChange={(crop) =>
                    setShots((current) => current.map((s, i) => (i === index ? { ...s, crop } : s)))
                  }
                />
                <button
                  type="button"
                  onClick={() => setShots((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove page ${index + 1}`}
                  className="min-h-[44px] self-start font-mono text-[11px] uppercase tracking-[0.08em] text-copper"
                >
                  Remove this page
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={Boolean(working)}>
          {shots.length ? 'Add another page' : 'Take a photo'}
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => {
            // Copy the FileList out BEFORE clearing the input: `value = ''` empties the
            // live list, so reading `files.length` afterwards always saw zero.
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            if (files.length) void addFiles(files)
          }}
        />

        {shots.length > 0 ? (
          <>
            <Button onClick={() => void read()} disabled={Boolean(working) || !hasApiKey()}>
              {working ?? 'Read the page'}
            </Button>
            <Button variant="secondary" disabled={Boolean(working)} onClick={() => void keepPhotos()}>
              Keep the photos, read them later
            </Button>
          </>
        ) : null}

        <section className="flex flex-col gap-2 rounded-sm border border-rule border-l-2 border-l-leaf bg-card px-[14px] py-[13px]">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            Or use any AI you already have
          </h2>
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            No key needed, and nothing to pay per recipe. Send the pages to whichever assistant
            you already use, then paste its reply back here. You still check everything before
            it saves.
          </p>
          {shots.length > 0 ? (
            <Button className="self-start" onClick={() => void sendToAI()}>
              {shots.length === 1 ? 'Send the page to my AI' : `Send ${shots.length} pages to my AI`}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            className="self-start"
            onClick={() =>
              void copyText(BRING_YOUR_OWN_AI_PROMPT).then((ok) =>
                toast(ok ? 'Instructions copied.' : "Couldn't copy — select the text by hand."),
              )
            }
          >
            Copy the instructions on their own
          </Button>
          <label className="mt-1 flex flex-col gap-[6px]">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
              Paste the reply
            </span>
            <textarea
              value={pasted}
              onChange={(event) => setPasted(event.target.value)}
              rows={4}
              placeholder='{ "title": "…", "ingredients": [ … ] }'
              className="w-full rounded-sm border border-rule bg-paper px-3 py-2 font-mono text-[12px] leading-[1.5] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            />
          </label>
          {pasted.trim() ? (
            <Button className="self-start" onClick={() => void readPastedReply()}>
              Check what it read
            </Button>
          ) : null}
          {pasteError ? (
            <p className="font-mono text-[11px] leading-[1.6] text-copper">{pasteError}</p>
          ) : null}
        </section>

        {error ? (
          <div className="flex flex-col gap-2 rounded-sm border border-copper/45 px-[14px] py-[13px]">
            <p className="font-mono text-[11px] leading-[1.6] text-copper">{error.message}</p>
            {error.detail ? (
              // Never swallowed: a screen that just says "it failed" is unfixable.
              <details>
                <summary className="min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft">
                  What came back
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-[1.5] text-ink-soft">
                  {error.detail}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </Screen>
  )
}

/** Blob → base64 without the data: prefix, which the API does not want. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}
