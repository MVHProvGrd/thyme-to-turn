import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import { Input, Label, Textarea } from '../components/Field'
import { useToast } from '../components/Toast'
import Tile from '../components/Tile'
import { PARSE_MODEL } from '../api/claude'
import { RECIPE_SCHEMA_VERSION } from '../api/prompts'
import { deleteRecipe, getRecipe, listBooks, listCategories, listTags, saveRecipe } from '../db/repo'
import { hasCategory, toggleCategory, unlistedLabels } from '../lib/categories'
import { draftFromParsed, groupsFromRows, isDoubted } from '../lib/parse-result'
import type { DraftRow } from '../lib/parse-result'
import type { ParsedRecipe, PhotoRef, Recipe } from '../lib/types'

/**
 * Type one in.
 *
 * Nothing here behaves like a form: an empty method saves fine, and a recipe with no title
 * is saved as "Untitled" rather than blocked. She is copying from a book with one hand —
 * the app's job is to take what it's given, not to grade it.
 *
 * In phase 4 this screen becomes the verification gate for a photographed page. That is
 * why the draft lives in React state and only reaches repo.saveRecipe on Save: an AI parse
 * will arrive as exactly this shape, and it must not exist in the database until a human
 * has looked at it.
 */
/**
 * The ingredient editor is a flat list of rows, and a heading is a row of its own, so
 * "For the crust" survives a parse, an edit and a save. A merged list is a wrong recipe,
 * not an untidy one.
 */
type Row =
  | { kind: 'heading'; text: string }
  | { kind: 'item'; quantity: string; item: string; raw?: string; optional?: boolean; index?: number }

const EMPTY_ROWS: Row[] = [
  { kind: 'item', quantity: '', item: '' },
  { kind: 'item', quantity: '', item: '' },
  { kind: 'item', quantity: '', item: '' },
]

/** Rows for saving: a typed line has no `raw`, so it is built from the two boxes. */
function toDraftRows(rows: Row[]): DraftRow[] {
  return rows.map((row) =>
    row.kind === 'heading'
      ? row
      : {
          kind: 'item' as const,
          raw: (row.raw ?? `${row.quantity} ${row.item}`).trim(),
          quantity: row.quantity,
          item: row.item,
          optional: Boolean(row.optional),
          index: row.index ?? 0,
        },
  )
}

export default function RecipeEdit() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()

  /*
   * ★ THE VERIFICATION GATE. A parse arrives here in navigation state and NOTHING has been
   * written — the recipe does not exist until she presses Save. Fields the model was unsure
   * of are marked so she checks those first rather than re-reading the whole page.
   */
  const incoming = (location.state ?? null) as { parsed?: ParsedRecipe; photos?: PhotoRef[] } | null
  const fromParse = incoming?.parsed ? draftFromParsed(incoming.parsed) : null

  const [loaded, setLoaded] = useState(!uuid)
  const doubts = fromParse?.doubts ?? new Set<string>()
  const [existing, setExisting] = useState<Recipe | null>(null)
  const [title, setTitle] = useState(fromParse?.title ?? '')
  const [citation, setCitation] = useState('')
  const [page, setPage] = useState('')
  const [rows, setRows] = useState<Row[]>(fromParse?.rows.length ? fromParse.rows : EMPTY_ROWS)
  const [method, setMethod] = useState(fromParse?.method ?? '')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [bookUuid, setBookUuid] = useState('')
  const [saving, setSaving] = useState(false)
  /**
   * Has she typed anything? Set from real DOM input events on the form wrapper rather than
   * threaded through every setter — loading a recipe calls those setters too, and a form
   * that marks itself dirty just by opening would nag on every single exit.
   */
  const [dirty, setDirty] = useState(false)

  /**
   * The tab bar is on every screen now, so "Plan a meal" is one thumb away from a form full of
   * work. A parse is the dangerous case: it lives in navigation state and is gone the
   * moment this screen unmounts, so an unsaved parse always asks, typed or not.
   */
  function confirmLeave(): boolean {
    if (saving) return true
    if (fromParse) {
      return confirm("Leave without saving? What was read from the page hasn't been saved yet.")
    }
    if (!dirty) return true
    return confirm('Leave without saving? Your changes will be lost.')
  }

  const books = useLiveQuery(listBooks, [], undefined)

  const categories = useLiveQuery(listCategories, [], undefined)
  const tagVocabulary = useLiveQuery(listTags, [], undefined)
  /**
   * Two rows of chips over one field. Categories say what KIND of meal it is, tags say
   * what it is LIKE — both land in `tags`, and the two vocabularies are what tell them
   * apart. Anything this recipe carries that has left BOTH lists shows with the
   * categories, so a label she removed from Settings is still visible and still un-pickable
   * one recipe at a time.
   */
  const choices = useMemo(() => {
    const list = categories ?? []
    return [...list, ...unlistedLabels([{ tags }], list, tagVocabulary ?? [])]
  }, [categories, tagVocabulary, tags])
  const tagChoices = tagVocabulary ?? []

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    void getRecipe(uuid).then((recipe) => {
      if (cancelled || !recipe) {
        if (!cancelled) setLoaded(true)
        return
      }
      setExisting(recipe)
      // A re-parse arrives with `fromParse` already in the fields — don't overwrite it with
      // what is on disk, or pressing "read it again" would silently show the old text.
      if (fromParse) {
        setBookUuid(recipe.source.bookUuid ?? '')
        setPage(recipe.source.pageStart ? String(recipe.source.pageStart) : '')
        setNotes(recipe.notes ?? '')
        setTags(recipe.tags)
        setLoaded(true)
        return
      }
      setTitle(recipe.title)
      setCitation(recipe.source.citation ?? '')
      setBookUuid(recipe.source.bookUuid ?? '')
      setPage(recipe.source.pageStart ? String(recipe.source.pageStart) : '')
      // Rebuild the rows from the saved groups, headings and all.
      const loaded: Row[] = []
      for (const group of recipe.ingredients) {
        if (group.heading) loaded.push({ kind: 'heading', text: group.heading })
        for (const item of group.items) {
          loaded.push({
            kind: 'item',
            quantity: [item.quantity ?? '', item.unit ?? ''].filter(String).join(' ').trim(),
            item: item.item ?? item.raw,
            raw: item.raw,
            optional: item.optional,
          })
        }
      }
      setRows(loaded.length ? loaded : EMPTY_ROWS)
      setMethod(recipe.steps.map((step) => step.text).join('\n'))
      setNotes(recipe.notes ?? '')
      setTags(recipe.tags)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [uuid])

  function updateRow(at: number, patch: Partial<Extract<Row, { kind: 'item' }>> | { text: string }) {
    setRows((current) => current.map((row, i) => (i === at ? ({ ...row, ...patch } as Row) : row)))
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await saveRecipe({
        uuid: existing?.uuid,
        title,
        source: {
          // A picked book wins: repo.saveRecipe fills the citation text from the book
          // itself and keeps it in step if she later corrects the title.
          kind: bookUuid || citation.trim() ? 'book' : 'other',
          ...(bookUuid ? { bookUuid } : {}),
          ...(!bookUuid && citation.trim() ? { citation: citation.trim() } : {}),
          ...(Number(page) > 0 ? { pageStart: Number(page) } : {}),
        },
        // A parsed line keeps the page's exact `raw`; a typed one is built from the boxes.
        // A parsed line keeps the page's exact `raw`; a typed one is built from the boxes.
        ingredients: groupsFromRows(toDraftRows(rows)),
        steps: method
          .split('\n')
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text, index) => ({ n: index + 1, text })),
        notes,
        tags,
        ...(incoming?.photos ? { photos: incoming.photos } : {}),
        ...(incoming?.parsed
          ? {
              parse: {
                model: PARSE_MODEL,
                schemaVersion: RECIPE_SCHEMA_VERSION,
                parsedAt: new Date().toISOString(),
                lowConfidenceFields: incoming.parsed.lowConfidenceFields ?? [],
              },
            }
          : {}),
      })
      toast('Saved.')
      navigate(`/recipe/${saved.uuid}`, { replace: true })
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!existing) return
    // Destructive, so it asks — and it says exactly what it will do.
    if (!confirm(`Delete "${existing.title}"? This can't be undone.`)) return
    await deleteRecipe(existing.uuid)
    toast('Deleted.')
    navigate('/recipes', { replace: true })
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
            {existing ? 'Edit recipe' : 'New recipe'}
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
        {fromParse ? (
          <div className="rounded-sm border border-rule border-l-2 border-l-leaf bg-card px-[14px] py-[13px]">
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              Read from your photo. Nothing is saved yet — check it and press Save.
              {doubts.size > 0
                ? ` ${doubts.size} ${doubts.size === 1 ? 'field was' : 'fields were'} hard to read; those are marked.`
                : ''}
            </p>
          </div>
        ) : null}

        <Input
          label="Title"
          serif
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Roast chicken with fennel"
        />

        {books && books.length > 0 ? (
          <div className="flex flex-col gap-[6px]">
            <label
              htmlFor="book"
              className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft"
            >
              From one of your books
            </label>
            {/* A select, not chips: book titles run long and chips truncate at 14 characters. */}
            <select
              id="book"
              value={bookUuid}
              onChange={(event) => setBookUuid(event.target.value)}
              className="min-h-[48px] w-full rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            >
              <option value="">— not from a book on the shelf —</option>
              {books.map((book) => (
                <option key={book.uuid} value={book.uuid}>
                  {book.title}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_88px] gap-[10px]">
          {bookUuid ? (
            <div className="flex flex-col gap-[6px]">
              <Label>Book</Label>
              <p className="flex min-h-[48px] items-center rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink-soft">
                {books?.find((book) => book.uuid === bookUuid)?.title ?? ''}
              </p>
            </div>
          ) : (
            <Input
              label="Book"
              value={citation}
              onChange={(event) => setCitation(event.target.value)}
              placeholder="The Zuni Café Cookbook"
            />
          )}
          <Input
            label="Page"
            inputMode="numeric"
            value={page}
            onChange={(event) => setPage(event.target.value.replace(/[^0-9]/g, ''))}
            placeholder="214"
          />
        </div>

        {choices.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Categories">
              {choices.map((name) => {
                const on = hasCategory(tags, name)
                return (
                  <Tile
                    key={name}
                    name={name}
                    state={on ? 'have' : 'unknown'}
                    ariaLabel={`${name}, ${on ? 'selected' : 'not selected'}`}
                    onTap={() => setTags((current) => toggleCategory(current, name))}
                  />
                )
              })}
            </div>
          </div>
        ) : null}

        {tagChoices.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tags">
              {tagChoices.map((name) => {
                const on = hasCategory(tags, name)
                return (
                  <Tile
                    key={name}
                    name={name}
                    state={on ? 'have' : 'unknown'}
                    ariaLabel={`${name}, ${on ? 'selected' : 'not selected'}`}
                    onTap={() => setTags((current) => toggleCategory(current, name))}
                  />
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label>Ingredients</Label>
          {rows.map((row, index) => {
            const itemNumber = rows.slice(0, index).filter((r) => r.kind === 'item').length + 1
            if (row.kind === 'heading') {
              return (
                <div key={index} className="grid grid-cols-[1fr_44px] gap-2 pt-1">
                  <input
                    value={row.text}
                    onChange={(event) => updateRow(index, { text: event.target.value })}
                    placeholder="For the crust"
                    aria-label={`Group heading ${index + 1}`}
                    className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft placeholder:text-ink-soft/60"
                  />
                  <button
                    type="button"
                    onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove heading ${index + 1}`}
                    className="min-h-[44px] rounded-sm border border-rule text-copper"
                  >
                    −
                  </button>
                </div>
              )
            }
            return (
              <div
                key={index}
                className={`grid grid-cols-[88px_1fr_44px] gap-2 ${
                  isDoubted(doubts, `ingredients.${row.index ?? -1}`) ? 'border-l-2 border-copper pl-2' : ''
                }`}
              >
                <input
                  value={row.quantity}
                  onChange={(event) => updateRow(index, { quantity: event.target.value })}
                  placeholder="1½ cups"
                  aria-label={`Quantity, line ${itemNumber}`}
                  className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60"
                />
                <input
                  value={row.item}
                  onChange={(event) => updateRow(index, { item: event.target.value })}
                  placeholder="flour"
                  aria-label={`Ingredient, line ${itemNumber}`}
                  className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60"
                />
                <button
                  type="button"
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Remove line ${itemNumber}`}
                  className="min-h-[44px] rounded-sm border border-rule text-copper"
                >
                  −
                </button>
              </div>
            )
          })}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRows((current) => [...current, { kind: 'item', quantity: '', item: '' }])}
              className="min-h-[44px] rounded-sm border border-dashed border-rule font-mono text-xs text-thyme"
            >
              + Add a line
            </button>
            <button
              type="button"
              onClick={() => setRows((current) => [...current, { kind: 'heading', text: '' }])}
              className="min-h-[44px] rounded-sm border border-dashed border-rule font-mono text-xs text-ink-soft"
            >
              + Add a heading
            </button>
          </div>
        </div>

        <Textarea
          label="Method — one step per line"
          rows={7}
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          placeholder={'Heat the oven to 220°C.\nSalt the chicken and leave it an hour.'}
        />

        <Textarea
          label="Your notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Used half the butter, still too rich."
        />

        {existing ? (
          <Button variant="destructive" onClick={() => void remove()} className="mt-2">
            Delete this recipe
          </Button>
        ) : null}
      </div>
    </Screen>
  )
}
