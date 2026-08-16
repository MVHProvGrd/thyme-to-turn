import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate, useParams } from 'react-router-dom'
import Screen from '../components/Screen'
import Button from '../components/Button'
import { useObjectUrl } from '../components/useObjectUrl'
import { useToast } from '../components/Toast'
import { getPhotoBlob, getRecipe, replacePhotoBytes } from '../db/repo'
import { prepareImage } from '../platform/camera'

/**
 * Square-crop a dish photo: drag to move it, the slider to zoom in.
 *
 * DESTRUCTIVE, and only for `dish` photos — it is her picture of her dinner and if she
 * hates the result she takes another. `repo.replacePhotoBytes` refuses a `page` photo
 * outright, because that one is evidence of what the page said when a parse turns out
 * wrong and is cropped with a rect instead (03-DATA-MODEL.md).
 *
 * The crop is kept in SOURCE pixels rather than screen pixels, so the preview and the
 * canvas that finally writes it agree no matter what size the viewport ended up.
 */
export default function PhotoCrop() {
  const { uuid = '', photoUuid = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()

  const recipe = useLiveQuery(() => getRecipe(uuid), [uuid], undefined)
  const blob = useLiveQuery(() => getPhotoBlob(photoUuid), [photoUuid], undefined)
  const url = useObjectUrl(blob)

  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [origin, setOrigin] = useState({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const viewport = useRef<HTMLDivElement>(null)

  // The square we take, in source pixels. Zoom 1 is the biggest square that fits.
  const shortEdge = size ? Math.min(size.width, size.height) : 0
  const crop = shortEdge / zoom

  useEffect(() => {
    if (!size) return
    setOrigin({ x: (size.width - shortEdge) / 2, y: (size.height - shortEdge) / 2 })
  }, [size, shortEdge])

  function clamp(next: { x: number; y: number }) {
    if (!size) return next
    return {
      x: Math.max(0, Math.min(size.width - crop, next.x)),
      y: Math.max(0, Math.min(size.height - crop, next.y)),
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, ox: origin.x, oy: origin.y }
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = drag.current
    const box = viewport.current?.clientWidth
    if (!start || !box || !size) return
    // Screen pixels → source pixels, so dragging tracks the image at any zoom.
    const perPixel = crop / box
    setOrigin(
      clamp({
        x: start.ox - (event.clientX - start.x) * perPixel,
        y: start.oy - (event.clientY - start.y) * perPixel,
      }),
    )
  }

  function onPointerUp() {
    drag.current = null
  }

  async function save() {
    if (!blob || !size) return
    setSaving(true)
    try {
      const image = await prepareImage(blob, {
        x: origin.x / size.width,
        y: origin.y / size.height,
        w: crop / size.width,
        h: crop / size.height,
      })
      await replacePhotoBytes(uuid, photoUuid, image.blob, { width: image.width, height: image.height })
      toast('Cropped.')
      navigate(`/recipe/${uuid}`, { replace: true })
    } catch {
      toast("That crop didn't save.")
    } finally {
      setSaving(false)
    }
  }

  // Scale that makes the chosen square exactly fill the viewport.
  const displayScale = size && crop ? 1 / (crop / size.width) : 1

  return (
    <Screen
      tabs={false}
      header={
        <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-[18px]">
          <button
            type="button"
            onClick={() => navigate(`/recipe/${uuid}`)}
            className="min-h-[44px] font-mono text-xs text-ink-soft"
          >
            ← Cancel
          </button>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Crop</span>
          <Button onClick={() => void save()} disabled={saving || !size}>
            Save
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 pb-10 pt-5">
        <div
          ref={viewport}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="relative aspect-square w-full touch-none overflow-hidden rounded-sm border border-rule bg-card"
        >
          {url ? (
            <img
              src={url}
              alt={recipe ? `${recipe.title}, being cropped` : 'Photo being cropped'}
              draggable={false}
              onLoad={(event) =>
                setSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              style={
                size
                  ? {
                      width: `${size.width * displayScale}px`,
                      maxWidth: 'none',
                      transform: `translate(${-origin.x * displayScale}px, ${-origin.y * displayScale}px)`,
                    }
                  : { width: '100%' }
              }
              className="select-none"
            />
          ) : null}
        </div>

        <label className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-soft">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => {
              setZoom(Number(event.target.value))
              setOrigin((current) => clamp(current))
            }}
            className="min-h-[44px] w-full accent-thyme"
          />
        </label>

        <p className="font-mono text-[11px] leading-[1.6] text-ink-soft">
          Drag the picture to move it. Saving replaces this photo — it's yours, so if you don't
          like it, take another.
        </p>
      </div>
    </Screen>
  )
}
