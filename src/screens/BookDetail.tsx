import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import { useObjectUrl } from '../components/useObjectUrl'
import { getBook, getPhotoBlob, recipesForBook } from '../db/repo'

/**
 * One book: what it is, and what she cooks from it.
 *
 * The recipe list here is ordered by page, because that is how she'd flick through the
 * physical copy sitting on the shelf.
 */
export default function BookDetail() {
  const { uuid = '' } = useParams()
  const navigate = useNavigate()
  const book = useLiveQuery(() => getBook(uuid), [uuid], undefined)
  const recipes = useLiveQuery(() => recipesForBook(uuid), [uuid], undefined)
  const blob = useLiveQuery(
    () => (book?.cover ? getPhotoBlob(book.cover.uuid) : Promise.resolve(undefined)),
    [book?.cover?.uuid],
    undefined,
  )
  const cover = useObjectUrl(blob)

  if (book === undefined) return <Screen tabs={false}>{null}</Screen>

  if (!book) {
    return (
      <Screen tabs={false}>
        <div className="p-5">
          <p className="font-serif text-[19px] text-ink">That book isn't here any more.</p>
          <Button className="mt-4" onClick={() => navigate('/books')}>
            Back to books
          </Button>
        </div>
      </Screen>
    )
  }

  const facts = [book.publisher, book.publishedYear, book.externalRefs.isbn13].filter(Boolean)

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
            ← Books
          </button>
          <button
            type="button"
            onClick={() => navigate(`/book/${book.uuid}/edit`)}
            className="min-h-[44px] px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft"
          >
            Edit
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-[22px] px-5 pb-10 pt-5">
        <div className="flex gap-4">
          <span className="flex h-[132px] w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule bg-card">
            {cover ? (
              <img src={cover} alt={`Cover of ${book.title}`} className="h-full w-full object-cover" />
            ) : (
              <span aria-hidden="true" className="font-mono text-[11px] text-ink-soft">
                no cover
              </span>
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-serif text-[26px] font-semibold leading-[1.15] text-ink [text-wrap:pretty]">
              {book.title || 'Untitled book'}
            </h1>
            {book.authors.length ? (
              <p className="font-mono text-xs leading-[1.6] text-ink-soft">{book.authors.join(', ')}</p>
            ) : null}
            {facts.length ? (
              <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">{facts.join(' · ')}</p>
            ) : null}
            {book.shelfNote ? (
              <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">{book.shelfNote}</p>
            ) : null}
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            From this book
          </h2>
          {recipes === undefined ? null : recipes.length === 0 ? (
            <p className="font-mono text-xs leading-[1.7] text-ink-soft">
              Nothing from this one yet. Add a recipe and pick this book as its source.
            </p>
          ) : (
            <ul>
              {recipes.map((recipe) => (
                <li key={recipe.uuid}>
                  <button
                    type="button"
                    onClick={() => navigate(`/recipe/${recipe.uuid}`, { state: { from: `/book/${book.uuid}` } })}
                    className="flex w-full items-baseline justify-between gap-3 border-b border-rule py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                  >
                    <span className="font-serif text-[19px] font-semibold leading-[1.25] text-ink">
                      {recipe.title}
                    </span>
                    {recipe.source.pageStart ? (
                      <span className="shrink-0 font-mono text-[11px] text-ink-soft">
                        p.{recipe.source.pageStart}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Screen>
  )
}
