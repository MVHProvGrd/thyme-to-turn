import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import { useToast } from '../components/Toast'
import { findBookByIsbn, saveBook, setBookCover } from '../db/repo'
import { LookupError, fetchCover, lookupIsbn } from '../api/openlibrary'
import { isValidIsbn13, pickIsbn } from '../lib/isbn'
import { hasCamera, startBarcodeScan } from '../platform/barcode'
import type { StopScanning } from '../platform/barcode'

/**
 * Scan the back of a cookbook, get a book record.
 *
 * The manual field is always on screen, never behind a "having trouble?" link (D8).
 * Cameras get denied, `BarcodeDetector` doesn't exist on any iOS browser, and old phones
 * fail at the WASM fallback — a feature whose only path is the clever one is broken for
 * somebody. Typing thirteen digits always works.
 *
 * Nothing here is a dead end: an ISBN Open Library has never heard of still makes a book,
 * with the ISBN filled in and the title hers to type.
 */
export default function BookScan() {
  const navigate = useNavigate()
  const toast = useToast()
  const video = useRef<HTMLVideoElement>(null)
  const stopRef = useRef<StopScanning | null>(null)
  const busy = useRef(false)

  const [typed, setTyped] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  /** Stop the camera on the way out, or the light stays on after she navigates away. */
  function stopCamera() {
    stopRef.current?.()
    stopRef.current = null
    setScanning(false)
  }

  useEffect(() => stopCamera, [])

  async function startCamera() {
    setError(null)
    try {
      const element = video.current
      if (!element) return
      stopRef.current = await startBarcodeScan(element, (codes) => {
        const isbn = pickIsbn(codes)
        if (isbn) void accept(isbn)
      })
      setScanning(true)
    } catch {
      setError("The camera didn't open. Type the number under the barcode instead.")
    }
  }

  /**
   * One ISBN, however it arrived. Duplicate check first — re-scanning a book she already
   * has opens it rather than making a second Zuni Café.
   */
  async function accept(isbn: string) {
    if (busy.current) return
    busy.current = true
    stopCamera()
    setError(null)

    try {
      const existing = await findBookByIsbn(isbn)
      if (existing) {
        toast('Already on your shelf.')
        navigate(`/book/${existing.uuid}`, { replace: true })
        return
      }

      setStatus('Looking it up…')
      let facts
      try {
        facts = await lookupIsbn(isbn)
      } catch (caught) {
        // A lookup failure must not lose the scan: make the book, let her type the title.
        setError(caught instanceof LookupError ? caught.message : "That lookup didn't work.")
      }

      const book = await saveBook({
        title: facts?.title ?? '',
        ...(facts?.subtitle ? { subtitle: facts.subtitle } : {}),
        authors: facts?.authors ?? [],
        ...(facts?.publisher ? { publisher: facts.publisher } : {}),
        ...(facts?.publishedYear ? { publishedYear: facts.publishedYear } : {}),
        externalRefs: facts?.externalRefs ?? { isbn13: isbn },
        source: facts ? 'openlibrary' : 'manual',
        lookedUpAt: new Date().toISOString(),
      })

      if (facts?.coverUrl) {
        setStatus('Getting the cover…')
        const cover = await fetchCover(facts.coverUrl)
        if (cover) await setBookCover(book.uuid, cover)
      }

      toast(facts ? 'Added to your shelf.' : 'Added — it needs a title.')
      navigate(`/book/${book.uuid}${facts ? '' : '/edit'}`, { replace: true })
    } finally {
      busy.current = false
      setStatus(null)
    }
  }

  function submitTyped() {
    const isbn = pickIsbn([typed])
    if (!isbn) {
      setError(
        isValidIsbn13(typed)
          ? "That number checks out but isn't a book code."
          : "That doesn't look like an ISBN. It's the 13 digits under the barcode.",
      )
      return
    }
    void accept(isbn)
  }

  return (
    <Screen
      tabs={false}
      header={
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate('/books')}
            className="min-h-[44px] font-mono text-xs text-ink-soft"
          >
            ← Back
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Add a book</span>
          <span className="min-w-[44px]" />
        </div>
      }
    >
      <div className="flex flex-col gap-[18px] px-5 pb-10 pt-5">
        <p className="font-mono text-xs leading-[1.7] text-ink-soft">
          Point the camera at the barcode on the back, or type the number under it. Books often
          carry a second, smaller barcode — that one is the price, and it's ignored.
        </p>

        {hasCamera() ? (
          <div className="flex flex-col gap-2">
            <div className="aspect-[4/3] w-full overflow-hidden rounded-sm border border-rule bg-card">
              {/* muted + playsInline or iOS refuses to play it inline */}
              <video ref={video} className="h-full w-full object-cover" muted playsInline />
            </div>
            <Button variant={scanning ? 'ghost' : 'secondary'} onClick={scanning ? stopCamera : () => void startCamera()}>
              {scanning ? 'Stop the camera' : 'Use the camera'}
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-[6px]">
          <label
            htmlFor="isbn"
            className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft"
          >
            Or type the ISBN
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              id="isbn"
              value={typed}
              inputMode="numeric"
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitTyped()
                }
              }}
              placeholder="9780393020434"
              className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            />
            <Button onClick={submitTyped}>Look up</Button>
          </div>
        </div>

        {status ? <p className="font-mono text-xs text-ink-soft">{status}</p> : null}
        {error ? (
          <p className="rounded-sm border border-copper/45 px-[14px] py-[13px] font-mono text-[11px] leading-[1.6] text-copper">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => navigate('/books/new')}
          className="min-h-[44px] self-start font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft underline underline-offset-4"
        >
          No barcode? Type the book in
        </button>
      </div>
    </Screen>
  )
}
