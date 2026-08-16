import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import { Input, Label, Textarea } from '../components/Field'
import { useToast } from '../components/Toast'
import Tile from '../components/Tile'
import { deleteRecipe, getRecipe, listCategories, saveRecipe } from '../db/repo'
import { hasCategory, sameCategory, toggleCategory } from '../lib/categories'
import type { Recipe } from '../lib/types'

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
type Line = { quantity: string; item: string }

const EMPTY_LINES: Line[] = [
  { quantity: '', item: '' },
  { quantity: '', item: '' },
  { quantity: '', item: '' },
]

export default function RecipeEdit() {
  const { uuid } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const [loaded, setLoaded] = useState(!uuid)
  const [existing, setExisting] = useState<Recipe | null>(null)
  const [title, setTitle] = useState('')
  const [citation, setCitation] = useState('')
  const [page, setPage] = useState('')
  const [lines, setLines] = useState<Line[]>(EMPTY_LINES)
  const [method, setMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const categories = useLiveQuery(listCategories, [], undefined)
  /** The vocabulary, plus any tag this recipe already carries that has left the list. */
  const choices = useMemo(() => {
    const list = categories ?? []
    const orphans = tags.filter((tag) => !list.some((name) => sameCategory(name, tag)))
    return [...list, ...orphans]
  }, [categories, tags])

  useEffect(() => {
    if (!uuid) return
    let cancelled = false
    void getRecipe(uuid).then((recipe) => {
      if (cancelled || !recipe) {
        if (!cancelled) setLoaded(true)
        return
      }
      setExisting(recipe)
      setTitle(recipe.title)
      setCitation(recipe.source.citation ?? '')
      setPage(recipe.source.pageStart ? String(recipe.source.pageStart) : '')
      const flat = recipe.ingredients.flatMap((group) => group.items)
      setLines(
        flat.length
          ? flat.map((item) => ({
              quantity: [item.quantity ?? '', item.unit ?? ''].filter(String).join(' ').trim(),
              item: item.item ?? item.raw,
            }))
          : EMPTY_LINES,
      )
      setMethod(recipe.steps.map((step) => step.text).join('\n'))
      setNotes(recipe.notes ?? '')
      setTags(recipe.tags)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [uuid])

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  async function save() {
    setSaving(true)
    try {
      const saved = await saveRecipe({
        uuid: existing?.uuid,
        title,
        source: {
          kind: citation.trim() ? 'book' : 'other',
          ...(citation.trim() ? { citation: citation.trim() } : {}),
          ...(Number(page) > 0 ? { pageStart: Number(page) } : {}),
        },
        ingredients: [
          {
            items: lines
              .map((line) => `${line.quantity} ${line.item}`.trim())
              .filter(Boolean)
              .map((raw) => ({ raw })),
          },
        ],
        steps: method
          .split('\n')
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text, index) => ({ n: index + 1, text })),
        notes,
        tags,
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

  if (!loaded) return <Screen tabs={false}>{null}</Screen>

  return (
    <Screen
      tabs={false}
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
    >
      <div className="flex flex-col gap-[18px] px-5 pb-10 pt-5">
        <Input
          label="Title"
          serif
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Roast chicken with fennel"
        />

        <div className="grid grid-cols-[1fr_88px] gap-[10px]">
          <Input
            label="Book"
            value={citation}
            onChange={(event) => setCitation(event.target.value)}
            placeholder="The Zuni Café Cookbook"
          />
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

        <div className="flex flex-col gap-2">
          <Label>Ingredients</Label>
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[88px_1fr_44px] gap-2">
              <input
                value={line.quantity}
                onChange={(event) => updateLine(index, { quantity: event.target.value })}
                placeholder="1½ cups"
                aria-label={`Quantity, line ${index + 1}`}
                className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60"
              />
              <input
                value={line.item}
                onChange={(event) => updateLine(index, { item: event.target.value })}
                placeholder="flour"
                aria-label={`Ingredient, line ${index + 1}`}
                className="min-h-[48px] rounded-sm border border-rule bg-card px-3 font-mono text-[13px] text-ink placeholder:text-ink-soft/60"
              />
              <button
                type="button"
                onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                aria-label={`Remove line ${index + 1}`}
                className="min-h-[44px] rounded-sm border border-rule text-copper"
              >
                −
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setLines((current) => [...current, { quantity: '', item: '' }])}
            className="min-h-[44px] rounded-sm border border-dashed border-rule font-mono text-xs text-thyme"
          >
            + Add a line
          </button>
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
