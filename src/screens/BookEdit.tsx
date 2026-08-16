import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import { Input } from '../components/Field'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { deleteBook, findBookByIsbn, getBook, saveBook } from '../db/repo'
import { isValidIsbn13, normalizeIsbn, pickIsbn } from '../lib/isbn'
import type { Book } from '../lib/types'

/**
 * Type a book in, or correct one a lookup got wrong. Old, foreign and self-published
 * cookbooks miss in every catalogue, so this screen is a first-class path rather than a
 * fallback — reachable straight from the scanner.
 *
 * Deleting a book never deletes a recipe (see repo.deleteBook); the confirm says so,
 * because "delete" next to a list of her recipes is a frightening word otherwise.
 */
export default function BookEdit() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const ask = useConfirm()

  const [loaded, setLoaded] = useState(!uuid)
  const [existing, setExisting] = useState<Book | null>(null)
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [publisher, setPublisher] = useState('')
  const [year, setYear] = useState('')
  const [isbn, setIsbn] = useState('')
  const [shelfNote, setShelfNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Typed-in, not loaded-in: real DOM input events only. See RecipeEdit for the why. */
  const [dirty, setDirty] = useState(false)

  /** The tab bar reaches this screen now, so a half-filled book is one tap from gone. */
  async function confirmLeave(): Promise<boolean> {
    if (saving || !dirty) return true
    return ask({
      title: 'Leave without saving?',
      body: 'Your changes to this book will be lost.',
      confirmLabel: 'Leave',
      cancelLabel: 'Stay here',
      destructive: true,
    })
  }

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    void getBook(uuid).then((book) => {
      if (cancelled) return
      if (book) {
        setExisting(book)
        setTitle(book.title)
        setAuthors(book.authors.join(', '))
        setPublisher(book.publisher ?? '')
        setYear(book.publishedYear ? String(book.publishedYear) : '')
        setIsbn(book.externalRefs.isbn13 ?? '')
        setShelfNote(book.shelfNote ?? '')
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [uuid])

  async function save() {
    setError(null)
    const typedIsbn = isbn.trim()
    const cleanIsbn = typedIsbn ? pickIsbn([typedIsbn]) : undefined
    if (typedIsbn && !cleanIsbn) {
      setError("That ISBN doesn't check out. Leave it blank rather than guess.")
      return
    }
    // The same duplicate guard the scanner uses — typing a number twice is just as easy.
    if (cleanIsbn) {
      const clash = await findBookByIsbn(cleanIsbn)
      if (clash && clash.uuid !== existing?.uuid) {
        setError(`That ISBN is already on your shelf as "${clash.title}".`)
        return
      }
    }

    setSaving(true)
    try {
      const saved = await saveBook({
        uuid: existing?.uuid,
        title,
        authors: authors.split(',').map((name) => name.trim()).filter(Boolean),
        publisher,
        ...(Number(year) > 0 ? { publishedYear: Number(year) } : {}),
        externalRefs: {
          ...(existing?.externalRefs ?? {}),
          ...(cleanIsbn ? { isbn13: cleanIsbn } : {}),
        },
        shelfNote,
        source: existing?.source ?? 'manual',
      })
      toast('Saved.')
      navigate(`/book/${saved.uuid}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!existing) return
    const ok = await ask({
      title: `Delete "${existing.title}"?`,
      body: 'The recipes from it are kept — they just stop pointing at it, and keep the citation they already show.',
      confirmLabel: 'Delete the book',
      destructive: true,
    })
    if (!ok) return
    await deleteBook(existing.uuid)
    toast('Deleted the book.')
    navigate('/books', { replace: true })
  }

  if (!loaded) return <Screen>{null}</Screen>

  return (
    <Screen
      header={
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[44px] font-mono text-xs text-ink-soft"
          >
            ← Cancel
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">
            {existing ? 'Edit book' : 'New book'}
          </span>
          <Button onClick={() => void save()} disabled={saving}>
            Save
          </Button>
        </div>
      }
      onLeave={confirmLeave}
    >
      <div
        onInput={() => setDirty(true)}
        onChange={() => setDirty(true)}
        className="flex flex-col gap-[18px] px-5 pb-10 pt-5"
      >
        <Input
          label="Title"
          serif
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="The Zuni Café Cookbook"
        />
        <Input
          label="Authors — separated by commas"
          value={authors}
          onChange={(event) => setAuthors(event.target.value)}
          placeholder="Judy Rodgers"
        />
        <div className="grid grid-cols-[1fr_88px] gap-[10px]">
          <Input
            label="Publisher"
            value={publisher}
            onChange={(event) => setPublisher(event.target.value)}
            placeholder="W. W. Norton"
          />
          <Input
            label="Year"
            inputMode="numeric"
            value={year}
            onChange={(event) => setYear(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="2002"
          />
        </div>
        <Input
          label="ISBN"
          inputMode="numeric"
          value={isbn}
          onChange={(event) => setIsbn(event.target.value)}
          placeholder="9780393020434"
        />
        {isbn.trim() && !isValidIsbn13(normalizeIsbn(isbn)) && !pickIsbn([isbn]) ? (
          <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
            That number doesn't check out yet — it's the 13 digits under the barcode.
          </p>
        ) : null}
        <Input
          label="Where it lives"
          value={shelfNote}
          onChange={(event) => setShelfNote(event.target.value)}
          placeholder="Top shelf, kitchen"
        />

        {error ? (
          <p className="rounded-sm border border-copper/45 px-[14px] py-[13px] font-mono text-[11px] leading-[1.6] text-copper">
            {error}
          </p>
        ) : null}

        {existing ? (
          <Button variant="destructive" onClick={() => void remove()} className="mt-2">
            Delete this book
          </Button>
        ) : null}
      </div>
    </Screen>
  )
}
