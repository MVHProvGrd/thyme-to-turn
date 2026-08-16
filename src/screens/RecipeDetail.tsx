import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import Photo from '../components/Photo'
import SourceLine from '../components/SourceLine'
import { addDishPhoto, getPhotoBlob, getRecipe, getSettings, listIngredients, removePhoto } from '../db/repo'
import { SCALE_STEPS, displayAmount, formatNumber, scaleYield } from '../lib/scale'
import { ParseError, parseRecipePhotos } from '../api/claude'
import { hasApiKey } from '../api/key'
import { prepareImage } from '../platform/camera'
import { formatUnit, ingredientNames } from '../lib/ingredients'
import { stateForNames } from '../lib/pantry'
import type { IngredientState } from '../lib/pantry'
import type { Ingredient, IngredientEntry } from '../lib/types'
import { readPref, readSession, writePref } from '../platform/prefs'

/**
 * Cook from it, hands full.
 *
 * Cook mode is a type scale, not a different screen: every size steps up so she can read
 * it at arm's length across a counter. Steps are tappable so she can keep her place.
 */
export default function RecipeDetail() {
  const { uuid = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Back returns to wherever she came from — the dinner screen or the list. A card on
  // the dinner screen passes `{ from: '/dinner' }`; anything else lands on the list.
  const from = (location.state as { from?: string } | null)?.from ?? '/recipes'
  const recipe = useLiveQuery(() => getRecipe(uuid), [uuid], undefined)
  const registry = useLiveQuery(listIngredients, [], undefined)

  // Tonight's marks from the dinner screen, so the row she is out of says so here too.
  // Read once on open — this screen never writes them.
  const [marks] = useState<Record<string, IngredientState>>(() => readSession('marks', {}))

  const fileInput = useRef<HTMLInputElement>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  // Scaling is a display choice, never a write: `raw` and the stored quantity are
  // untouched, so doubling a recipe can never corrupt what the page actually said.
  const [factor, setFactor] = useState(() => readPref(`scale:${uuid}`, 1))
  const settings = useLiveQuery(getSettings, [], undefined)
  const preference = settings?.unitPreference ?? 'as-written'

  function chooseScale(next: number) {
    setFactor(next)
    writePref(`scale:${uuid}`, next)
  }
  const [cook, setCook] = useState(() => readPref('cookMode', false))

  /**
   * Her own photo of the dish. Downscaled to 2000px before it is stored — a phone shot is
   * 4–8 MB and two hundred of those is an eviction waiting to happen.
   */
  async function addPhoto(file: File) {
    setPhotoError(null)
    try {
      const image = await prepareImage(file)
      await addDishPhoto(uuid, image.blob, { width: image.width, height: image.height })
    } catch {
      setPhotoError("That photo couldn't be read. Try another one.")
    }
  }
  const [done, setDone] = useState<Record<string, boolean>>(() => readPref(`done:${uuid}`, {}))

  function toggleCook() {
    setCook((current) => {
      writePref('cookMode', !current)
      return !current
    })
  }

  function toggleStep(n: number) {
    setDone((current) => {
      const next = { ...current, [n]: !current[n] }
      writePref(`done:${uuid}`, next)
      return next
    })
  }

  /**
   * Read the stored page photos again. This is the other half of "keep the photos, read
   * them later": an unverified recipe carrying page photos is a parse waiting for signal.
   * Re-parse is always a button she presses — nothing re-sends a photo on its own, and
   * nothing costs money without a tap.
   */
  async function readPages(pageUuids: string[]) {
    setPhotoError(null)
    setReading(true)
    try {
      const blobs = await Promise.all(pageUuids.map((id) => getPhotoBlob(id)))
      const images = await Promise.all(
        blobs.filter(Boolean).map(async (blob) => ({
          base64: await blobToBase64(blob as Blob),
          mediaType: 'image/jpeg' as const,
        })),
      )
      const { parsed, model } = await parseRecipePhotos(images)
      navigate(`/edit/${uuid}`, { state: { parsed, model } })
    } catch (caught) {
      setPhotoError(caught instanceof ParseError ? caught.message : "That didn't work.")
    } finally {
      setReading(false)
    }
  }

  if (recipe === undefined) return <Screen>{null}</Screen>

  if (recipe === null || !recipe) {
    return (
      <Screen>
        <div className="p-5">
          <p className="font-serif text-[19px] text-ink">That recipe isn't here any more.</p>
          <Button className="mt-4" onClick={() => navigate('/recipes')}>
            Back to recipes
          </Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen
      header={
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate(from)}
            className="min-h-[44px] font-mono text-xs text-ink-soft"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleCook}
              aria-pressed={cook}
              className={`min-h-[44px] rounded-full border px-4 font-mono text-[11px] uppercase tracking-[0.08em] ${
                cook ? 'border-thyme bg-thyme text-paper' : 'border-thyme bg-transparent text-thyme'
              }`}
            >
              {cook ? 'Cook mode on' : 'Cook mode'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/edit/${recipe.uuid}`)}
              className="min-h-[44px] px-2 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-soft"
            >
              Edit
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-[22px] px-5 pb-8 pt-5">
        <div className="flex flex-col gap-2">
          <h1
            className={`font-serif font-semibold leading-[1.15] text-ink ${cook ? 'text-[30px]' : 'text-[26px]'}`}
          >
            {recipe.title}
          </h1>
          {recipe.source.bookUuid ? (
            <button
              type="button"
              onClick={() => navigate(`/book/${recipe.source.bookUuid}`)}
              className="min-h-[44px] self-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
            >
              <SourceLine
                citation={recipe.source.citation}
                page={recipe.source.pageStart}
                className="!text-thyme underline underline-offset-[3px]"
              />
            </button>
          ) : (
            <SourceLine
              citation={recipe.source.citation}
              page={recipe.source.pageStart}
              className="!text-thyme underline underline-offset-[3px]"
            />
          )}
          {recipe.yield?.text ? (
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              {scaleYield(recipe.yield.text, factor)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Make</span>
          <div role="group" aria-label="Scale the recipe" className="flex gap-2">
            {SCALE_STEPS.map((step) => {
              const on = factor === step
              return (
                <button
                  key={step}
                  type="button"
                  aria-pressed={on}
                  onClick={() => chooseScale(step)}
                  className={`min-h-[44px] rounded-full border px-4 font-mono text-xs ${
                    on ? 'border-transparent bg-leaf/[0.16] font-semibold text-thyme' : 'border-rule bg-card text-ink'
                  }`}
                >
                  ×{formatNumber(step)}
                </button>
              )
            })}
          </div>
          {factor !== 1 ? (
            <span className="font-mono text-[11px] text-ink-soft">
              amounts only — the method still reads as printed
            </span>
          ) : null}
        </div>

        {recipe.ingredients.map((group, groupIndex) => (
          <section
            key={group.heading ?? groupIndex}
            className="rounded-sm border border-rule bg-card px-4 pb-[14px] pt-4"
          >
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              {group.heading ?? 'Ingredients'}
            </h2>
            <ul className="mt-3 grid grid-cols-[88px_1fr_auto] gap-x-[10px] gap-y-[9px]">
              {group.items.map((item, itemIndex) => {
                const state = markFor(item, marks, registry ?? [])
                return (
                  <li key={itemIndex} className="col-span-3 grid grid-cols-subgrid">
                    <span className={`font-mono text-ink-soft ${cook ? 'text-[15px]' : 'text-[13px]'}`}>
                      {displayAmount(item.quantity, item.unit, { factor, preference, formatUnit })}
                    </span>
                    <span className={`font-mono text-ink ${cook ? 'text-[15px]' : 'text-[13px]'}`}>
                      {item.item ?? item.raw}
                      {item.note ? <span className="text-ink-soft">, {item.note}</span> : null}
                    </span>
                    <span className={`font-mono ${cook ? 'text-[15px]' : 'text-[13px]'}`}>
                      {state === 'have' ? (
                        <span className="text-leaf" aria-label="have">
                          ✓
                        </span>
                      ) : state === 'dontHave' ? (
                        <span className="text-copper">missing</span>
                      ) : null}
                    </span>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {recipe.steps.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Method</h2>
            {recipe.steps.map((step) => {
              const isDone = done[step.n]
              return (
                <button
                  key={step.n}
                  type="button"
                  onClick={() => toggleStep(step.n)}
                  aria-pressed={isDone}
                  className={`grid w-full grid-cols-[34px_1fr] gap-[10px] rounded-sm border text-left ${
                    cook ? 'px-[14px] py-4' : 'p-[13px]'
                  } ${isDone ? 'border-transparent bg-leaf/10' : 'border-rule bg-card'}`}
                >
                  <span className={`font-mono text-xs ${isDone ? 'text-leaf' : 'text-ink-soft'}`}>
                    {String(step.n).padStart(2, '0')}
                  </span>
                  <span
                    className={`font-serif leading-[1.45] ${cook ? 'text-[21px]' : 'text-base'} ${
                      isDone ? 'text-ink-soft' : 'text-ink'
                    }`}
                  >
                    {step.text}
                  </span>
                </button>
              )
            })}
          </section>
        ) : null}

        {recipe.photos.some((photo) => photo.kind === 'page') ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
              The page
            </h2>
            <ul className="flex flex-wrap gap-2">
              {recipe.photos
                .filter((photo) => photo.kind === 'page')
                .map((ref) => (
                  <li key={ref.uuid}>
                    <DishPhoto uuid={ref.uuid} title={`${recipe.title}, the page`} />
                  </li>
                ))}
            </ul>
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              {recipe.verified
                ? 'The page it came from, kept so a wrong line is always fixable.'
                : 'Photographed but not read yet.'}
            </p>
            <Button
              variant="secondary"
              className="self-start"
              disabled={reading || !hasApiKey()}
              onClick={() =>
                void readPages(recipe.photos.filter((p) => p.kind === 'page').map((p) => p.uuid))
              }
            >
              {reading ? 'Reading…' : recipe.verified ? 'Read the page again' : 'Read the page'}
            </Button>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
            Photos of it
          </h2>
          {recipe.photos.some((photo) => photo.kind === 'dish') ? (
            <ul className="flex flex-wrap gap-2">
              {recipe.photos.filter((photo) => photo.kind === 'dish').map((ref) => (
                <li key={ref.uuid} className="flex flex-col gap-1">
                  <DishPhoto uuid={ref.uuid} title={recipe.title} />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/recipe/${recipe.uuid}/photo/${ref.uuid}/crop`)}
                      aria-label={`Crop this photo of ${recipe.title}`}
                      className="min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-thyme"
                    >
                      Crop
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePhoto(recipe.uuid, ref.uuid)}
                      aria-label={`Remove this photo of ${recipe.title}`}
                      className="min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-copper"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
              A photo of what you actually made turns the recipe list into your own food.
            </p>
          )}
          <Button variant="secondary" className="self-start" onClick={() => fileInput.current?.click()}>
            Add a photo
          </Button>
          {/* One control, camera and library both — boring and universal on either phone. */}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void addPhoto(file)
            }}
          />
          {photoError ? (
            <p className="font-mono text-[11px] leading-[1.6] text-copper">{photoError}</p>
          ) : null}
        </section>

        {recipe.notes ? (
          <section className="flex flex-col gap-2">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Her notes</h2>
            <p className="whitespace-pre-wrap font-serif text-base leading-[1.5] text-ink">{recipe.notes}</p>
          </section>
        ) : null}
      </div>
    </Screen>
  )
}

/** Blob -> base64 without the data: prefix, which the API does not want. */
function blobToBase64(blob: Blob): Promise<string> {
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

/** One stored photo. Fetches its own blob so the list above stays a plain map. */
function DishPhoto({ uuid, title }: { uuid: string; title: string }) {
  const blob = useLiveQuery(() => getPhotoBlob(uuid), [uuid], undefined)
  return <Photo blob={blob} alt={`${title}, as made`} className="h-24 w-24" />
}

/**
 * The trailing marker on an ingredient row: what tonight's marks say about this line,
 * through the same alias/prefix resolution the dinner screen used. Staples never carry
 * one — they were never in the question.
 */
function markFor(
  item: Ingredient,
  marks: Record<string, IngredientState>,
  registry: IngredientEntry[],
): IngredientState {
  // A line offering a choice is only "missing" once she has ruled out every option —
  // the same rule the dinner screen used, so the two never disagree about one row.
  const names = ingredientNames(item)
  if (names.length === 0 || registry.length === 0) return 'unknown'
  return stateForNames(names, marks, registry)
}

