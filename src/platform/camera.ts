/**
 * Photos in, and made storable. THE NATIVE SEAM for images: the screens hand over a File
 * from `<input type="file" accept="image/*" capture>` (camera *and* library in one control
 * on both platforms) and get back a blob the database can keep.
 *
 * Downscale on capture, before storing: max 2000px on the long edge, JPEG q≈0.85. A phone
 * shot is 4–8 MB; 200 of those is an eviction waiting to happen. Do NOT "optimise" this
 * further down — 2000px is what keeps a page photo readable when it is the only remaining
 * record of what page 214 said (03-DATA-MODEL.md).
 */

export const MAX_EDGE = 2000
export const JPEG_QUALITY = 0.85

import { inkBox } from '../lib/ink'
import type { CropRect } from '../lib/types'

export type StoredImage = { blob: Blob; mime: 'image/jpeg'; width: number; height: number }

export type { CropRect }

async function decode(source: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation honours the EXIF rotation phones write, so a portrait shot stays portrait.
      return await createImageBitmap(source, { imageOrientation: 'from-image' })
    } catch {
      // Older Safari: fall through to an <img>.
    }
  }
  const url = URL.createObjectURL(source)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("That file isn't an image this phone can read."))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function sizeOf(image: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  return 'naturalWidth' in image
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height }
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't save that photo."))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * Downscale to ≤MAX_EDGE on the long side and re-encode as JPEG. Optionally crop first
 * (fractional rect on the source). Always returns a fresh blob — the caller decides
 * whether the original is kept (page photos) or replaced (dish photos).
 */
export async function prepareImage(source: Blob, crop?: CropRect, maxEdge = MAX_EDGE): Promise<StoredImage> {
  const image = await decode(source)
  const full = sizeOf(image)
  const sx = crop ? Math.round(crop.x * full.width) : 0
  const sy = crop ? Math.round(crop.y * full.height) : 0
  const sw = crop ? Math.max(1, Math.round(crop.w * full.width)) : full.width
  const sh = crop ? Math.max(1, Math.round(crop.h * full.height)) : full.height

  const scale = Math.min(1, maxEdge / Math.max(sw, sh))
  const width = Math.max(1, Math.round(sw * scale))
  const height = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("Couldn't prepare that photo.")
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height)
  if ('close' in image) image.close()

  const blob = await toJpeg(canvas)
  return { blob, mime: 'image/jpeg', width, height }
}

/**
 * How wide the greyscale copy is when hunting for the text block. A page's margins are a
 * coarse feature — 240px finds them just as well as 2000px and does it in a few
 * milliseconds on a phone, which is what lets this run on every capture without a spinner.
 */
const INK_SAMPLE_EDGE = 240

/**
 * Suggest a box around the print on a photographed page, or undefined when there is nothing
 * confident to say. The decision lives in `lib/ink.ts`; this only supplies the pixels.
 *
 * The result is a SUGGESTION. It is drawn into the box she can drag, and "Whole page" puts
 * it back — an automatic crop that silently dropped half the ingredients would be exactly
 * the confident-wrong-answer failure the verification gate exists to prevent.
 */
export async function findTextBox(source: Blob): Promise<CropRect | undefined> {
  try {
    const image = await decode(source)
    const full = sizeOf(image)
    const scale = Math.min(1, INK_SAMPLE_EDGE / Math.max(full.width, full.height))
    const width = Math.max(1, Math.round(full.width * scale))
    const height = Math.max(1, Math.round(full.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return undefined
    ctx.drawImage(image, 0, 0, width, height)
    if ('close' in image) image.close()

    const { data } = ctx.getImageData(0, 0, width, height)
    const grey = new Uint8Array(width * height)
    for (let i = 0; i < grey.length; i += 1) {
      const at = i * 4
      // Rec. 601 luma. Ink is ink whatever colour the paper has aged to.
      grey[i] = (data[at] * 299 + data[at + 1] * 587 + data[at + 2] * 114) / 1000
    }
    return inkBox({ data: grey, width, height })
  } catch {
    // A photo we cannot decode is not worth an error here — she can still draw the box.
    return undefined
  }
}
