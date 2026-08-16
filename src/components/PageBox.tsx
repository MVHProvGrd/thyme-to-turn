import { useRef, useState } from 'react'
import { useObjectUrl } from './useObjectUrl'
import type { CropRect } from '../lib/types'

/**
 * Draw a box around the recipe on a photographed page.
 *
 * NON-DESTRUCTIVE, and that distinction is the whole point. The box says which part to
 * SEND; the original photograph is stored whole, because it is the only remaining record
 * of what page 214 actually said when a parse turns out wrong. Dish photos are hers and
 * crop destructively (PhotoCrop); a page never does.
 *
 * Boxing the recipe is an accuracy feature wearing a tidiness costume: a spread often
 * carries two recipes plus the gutter and half the facing page, and cutting that away both
 * improves the parse and roughly halves the image tokens it costs.
 *
 * Drag from one corner to the other. Coordinates are fractional (0–1) so they survive the
 * downscale that happens later, and any box smaller than a few percent is treated as a
 * stray tap rather than an intent to crop a sliver.
 *
 * "Find the text" asks the screen to box the print automatically (lib/ink.ts). It is a
 * SUGGESTION she can drag or undo, never a silent crop -- the detector finds ink, not
 * text, and a confident wrong box that drops half the ingredients is the failure mode this
 * whole app is arranged to avoid.
 */
export default function PageBox({
  blob,
  crop,
  onChange,
  onFindText,
  label,
}: {
  blob: Blob
  crop: CropRect | undefined
  onChange: (crop: CropRect | undefined) => void
  /** Ask for the print to be boxed automatically. Omitted when the screen can't offer it. */
  onFindText?: () => void
  label: string
}) {
  const url = useObjectUrl(blob)
  const frame = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState<CropRect | null>(null)

  function pointAt(event: React.PointerEvent) {
    const box = frame.current?.getBoundingClientRect()
    if (!box) return null
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    }
  }

  function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): CropRect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(a.x - b.x),
      h: Math.abs(a.y - b.y),
    }
  }

  function onPointerDown(event: React.PointerEvent) {
    const point = pointAt(event)
    if (!point) return
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = point
    setDragging({ x: point.x, y: point.y, w: 0, h: 0 })
  }

  function onPointerMove(event: React.PointerEvent) {
    const from = start.current
    const point = from && pointAt(event)
    if (from && point) setDragging(rectBetween(from, point))
  }

  function onPointerUp() {
    const drawn = dragging
    start.current = null
    setDragging(null)
    // A tap is not a crop.
    if (drawn && drawn.w > 0.05 && drawn.h > 0.05) onChange(drawn)
  }

  const shown = dragging ?? crop

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative w-full touch-none overflow-hidden rounded-sm border border-rule bg-card"
      >
        {url ? <img src={url} alt={label} draggable={false} className="w-full select-none" /> : null}
        {shown ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border-2 border-leaf bg-leaf/10"
            style={{
              left: `${shown.x * 100}%`,
              top: `${shown.y * 100}%`,
              width: `${shown.w * 100}%`,
              height: `${shown.h * 100}%`,
            }}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] leading-[1.6] text-ink-soft">
          {crop ? 'Only the box is sent. The whole page is kept.' : 'Drag a box around the recipe.'}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {onFindText ? (
            <button
              type="button"
              onClick={onFindText}
              className="min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-thyme underline underline-offset-4"
            >
              Find the text
            </button>
          ) : null}
          {crop ? (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="min-h-[44px] font-mono text-[11px] uppercase tracking-[0.08em] text-thyme underline underline-offset-4"
            >
              Whole page
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
