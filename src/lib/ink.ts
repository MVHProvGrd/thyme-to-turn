import type { CropRect } from './types'

/**
 * Finding the printed block on a photographed page — WITHOUT reading it.
 *
 * This is deliberately not OCR. It answers one narrow question: which rectangle of this
 * photo has ink on it? Paper is bright, print is dark, and the margins are empty; that is
 * enough to put a box around the text and throw away the tablecloth, the gutter and half
 * the facing page. Cutting that away both improves the parse and roughly halves the image
 * tokens a page costs (see PageBox).
 *
 * It finds INK, not TEXT. A dark table edge, a photograph on the page, or a shadow across
 * the gutter all count as ink and will widen the box. That is exactly why the result is
 * offered as a SUGGESTION she can drag or reset, never applied silently — the same posture
 * as the verification gate. A confident wrong crop that quietly drops half the ingredients
 * is the failure this app exists to avoid.
 *
 * Pure by design: it takes bytes and returns a rectangle, so it is tested without a
 * browser, a canvas or a photo. `platform/camera.ts` does the decoding.
 */

/** A downscaled greyscale copy of a photo. One byte per pixel, 0 = black, 255 = white. */
export type GreyImage = { data: Uint8Array; width: number; height: number }

/** A pixel rectangle, inclusive on all four edges. */
type Box = { left: number; top: number; right: number; bottom: number }

/**
 * Otsu's method over one region: the brightness that best splits it into two groups.
 * Parameter-free, which matters because kitchen lighting is not a constant we can tune to.
 */
function otsuThreshold(data: Uint8Array, width: number, region: Box): number {
  const histogram = new Array<number>(256).fill(0)
  let total = 0
  for (let y = region.top; y <= region.bottom; y += 1) {
    const start = y * width
    for (let x = region.left; x <= region.right; x += 1) {
      histogram[data[start + x]] += 1
      total += 1
    }
  }
  if (total === 0) return 0

  let sum = 0
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value]

  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1

  for (let t = 0; t < 256; t += 1) {
    weightBackground += histogram[t]
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break

    sumBackground += t * histogram[t]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2

    if (variance > bestVariance) {
      bestVariance = variance
      best = t
    }
  }
  return best
}

/**
 * A row or column has to carry this share of the busiest one to count as part of the block.
 * Low enough to keep a short final line of ingredients, high enough that one dust speck in
 * the margin does not drag the box out to the edge of the photo.
 */
const NOISE_FLOOR = 0.06

/** Breathing room so the box never clips an ascender or a fraction glyph. */
const PADDING = 0.02

/**
 * The smallest and largest boxes worth suggesting. A box covering the whole photo tells her
 * nothing she did not already have, and a sliver is a detection failure rather than a crop.
 */
const MIN_SIDE = 0.05
const MAX_SIDE = 0.95

/**
 * Bounding box of the pixels matching `wanted`, within `region`, ignoring stray specks.
 * Row and column profiles are used rather than a flood fill: gaps between lines of type
 * must stay inside the box, and a projection keeps them there for free.
 */
function boxOf(
  data: Uint8Array,
  width: number,
  region: Box,
  wanted: (value: number) => boolean,
): { box: Box; share: number } | undefined {
  const rowCount = region.bottom - region.top + 1
  const columnCount = region.right - region.left + 1
  const rows = new Array<number>(rowCount).fill(0)
  const columns = new Array<number>(columnCount).fill(0)
  let hits = 0

  for (let y = region.top; y <= region.bottom; y += 1) {
    const start = y * width
    for (let x = region.left; x <= region.right; x += 1) {
      if (wanted(data[start + x])) {
        rows[y - region.top] += 1
        columns[x - region.left] += 1
        hits += 1
      }
    }
  }
  if (hits === 0) return undefined

  let maxRow = 0
  for (let i = 0; i < rows.length; i += 1) if (rows[i] > maxRow) maxRow = rows[i]
  let maxColumn = 0
  for (let i = 0; i < columns.length; i += 1) if (columns[i] > maxColumn) maxColumn = columns[i]

  const vertical = extent(rows, maxRow * NOISE_FLOOR)
  const horizontal = extent(columns, maxColumn * NOISE_FLOOR)
  if (!vertical || !horizontal) return undefined

  return {
    box: {
      left: region.left + horizontal[0],
      right: region.left + horizontal[1],
      top: region.top + vertical[0],
      bottom: region.top + vertical[1],
    },
    share: hits / (rowCount * columnCount),
  }
}

/** First and last index whose profile clears the floor. Interior gaps (line leading) are kept. */
function extent(profile: number[], floor: number): [number, number] | undefined {
  let first = -1
  let last = -1
  for (let i = 0; i < profile.length; i += 1) {
    if (profile[i] > floor) {
      if (first < 0) first = i
      last = i
    }
  }
  return first < 0 ? undefined : [first, last]
}

/**
 * Box the ink in a photographed page, or return undefined when there is nothing confident
 * to say. Coordinates are fractional (0-1) so they survive any later downscale.
 *
 * TWO STAGES, and the first one is the one that makes this usable on a real photograph.
 * A page is rarely photographed in isolation: it sits on a worktop, and a dark table is
 * darker than the print. Thresholding the whole frame at once counts that table as ink,
 * the box grows to the edges, and the suggestion is worthless. So find the PAPER first --
 * the bright region -- and hunt for ink only inside it. When she has framed the page
 * tightly the paper is the whole frame and this collapses back to a single pass.
 */
export function inkBox(image: GreyImage): CropRect | undefined {
  const { data, width, height } = image
  if (width < 8 || height < 8 || data.length !== width * height) return undefined

  const whole: Box = { left: 0, top: 0, right: width - 1, bottom: height - 1 }

  // Stage one: the sheet of paper, as the bright thing in the picture.
  const bright = otsuThreshold(data, width, whole)
  const found = boxOf(data, width, whole, (value) => value > bright)
  const paper = found ? found.box : whole
  const paperWidth = paper.right - paper.left + 1
  const paperHeight = paper.bottom - paper.top + 1
  // Too little paper to be a page. Better to say nothing than to box a highlight.
  if (paperWidth < width * 0.2 || paperHeight < height * 0.2) return undefined

  // Stage two: the print, as the dark thing on that paper.
  const dark = otsuThreshold(data, width, paper)
  const ink = boxOf(data, width, paper, (value) => value <= dark)
  if (!ink) return undefined

  // A blank sheet has nothing to box; a page that is more ink than paper (a full-bleed
  // photograph, a dark spread) has no margins to trim and the threshold is measuring noise.
  if (ink.share < 0.002 || ink.share > 0.6) return undefined

  const x0 = Math.max(0, ink.box.left / width - PADDING)
  const y0 = Math.max(0, ink.box.top / height - PADDING)
  const x1 = Math.min(1, (ink.box.right + 1) / width + PADDING)
  const y1 = Math.min(1, (ink.box.bottom + 1) / height + PADDING)

  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  if (box.w > MAX_SIDE && box.h > MAX_SIDE) return undefined
  if (box.w < MIN_SIDE || box.h < MIN_SIDE) return undefined
  return box
}
