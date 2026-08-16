import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import { useObjectUrl } from '../components/useObjectUrl'
import { getPhotoBlob, listBooks } from '../db/repo'
import type { Book } from '../lib/types'

/** Her shelf. The point of the app is to be an index into these, not a replacement. */
export default function BookList() {
  const navigate = useNavigate()
  const books = useLiveQuery(listBooks, [], undefined)

  return (
    <Screen
      header={
        <div className="px-5 pb-[14px] pt-[22px]">
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => navigate('/recipes')}
              className="min-h-[44px] font-mono text-xs text-ink-soft"
            >
              ← Recipes
            </button>
            <Button variant="secondary" onClick={() => navigate('/books/scan')}>
              + Scan
            </Button>
          </div>
          <h1 className="mt-1 font-serif text-[27px] font-semibold leading-[1.1] tracking-[-0.01em] text-thyme">
            Books
          </h1>
        </div>
      }
    >
      <div className="px-5 pb-10 pt-4">
        {books === undefined ? null : books.length === 0 ? (
          <EmptyState
            line="No books yet. Scan the barcode on the back of one you cook from."
            action={<Button onClick={() => navigate('/books/scan')}>Scan a book</Button>}
          />
        ) : (
          <ul className="flex flex-col">
            {books.map((book) => (
              <li key={book.uuid}>
                <BookRow book={book} onOpen={() => navigate(`/book/${book.uuid}`)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  )
}

function BookRow({ book, onOpen }: { book: Book; onOpen: () => void }) {
  const blob = useLiveQuery(
    () => (book.cover ? getPhotoBlob(book.cover.uuid) : Promise.resolve(undefined)),
    [book.cover?.uuid],
    undefined,
  )
  const cover = useObjectUrl(blob)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-rule py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
    >
      {/* 56×56 slot whether or not there's art, so the titles line up down the page. */}
      <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule bg-card">
        {cover ? (
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true" className="font-mono text-[11px] text-ink-soft">
            {book.title.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-[5px]">
        <span className="font-serif text-[19px] font-semibold leading-[1.25] text-ink">{book.title}</span>
        <span className="font-mono text-[11px] leading-[1.5] text-ink-soft">
          {[book.authors.join(', '), book.publishedYear].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  )
}
