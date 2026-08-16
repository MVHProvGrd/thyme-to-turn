import { describe, it, expect } from 'vitest'
import { inkBox, type GreyImage } from '../ink'

/** A sheet of bright paper. */
function page(width: number, height: number, paper = 235): GreyImage {
  return { data: new Uint8Array(width * height).fill(paper), width, height }
}

/** Paint a solid dark rectangle, in fractional coordinates, onto a page. */
function ink(image: GreyImage, x: number, y: number, w: number, h: number, value = 30): GreyImage {
  const left = Math.round(x * image.width)
  const top = Math.round(y * image.height)
  const right = Math.round((x + w) * image.width)
  const bottom = Math.round((y + h) * image.height)
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) image.data[py * image.width + px] = value
  }
  return image
}

/**
 * Lines of print with white space between them, which is what a real page looks like to a
 * row profile: the block is dense but interrupted.
 */
function linesOfText(image: GreyImage, x: number, y: number, w: number, h: number, lines = 8): GreyImage {
  const step = h / lines
  for (let i = 0; i < lines; i += 1) ink(image, x, y + i * step, w, step * 0.55)
  return image
}

/** A sheet of paper photographed on a dark worktop, which is what a real page looks like. */
function onTable(width: number, height: number, sheet = 0.86, table = 60, paper = 235): GreyImage {
  const image: GreyImage = { data: new Uint8Array(width * height).fill(table), width, height }
  const margin = (1 - sheet) / 2
  return ink(image, margin, margin, sheet, sheet, paper)
}

describe('inkBox', () => {
  it('boxes a block of text and leaves the margins out', () => {
    const box = inkBox(linesOfText(page(200, 260), 0.2, 0.25, 0.6, 0.5))
    expect(box).toBeDefined()
    // Within the padding of the block it was given, and comfortably inside the page.
    expect(box!.x).toBeGreaterThan(0.14)
    expect(box!.x).toBeLessThan(0.22)
    expect(box!.y).toBeGreaterThan(0.19)
    expect(box!.y).toBeLessThan(0.27)
    expect(box!.w).toBeLessThan(0.7)
    expect(box!.h).toBeLessThan(0.6)
  })

  it('keeps the gaps between lines inside the box', () => {
    // The whole point: a row profile dips to zero between lines, and the box must not
    // fragment at the first blank row.
    const box = inkBox(linesOfText(page(200, 300), 0.15, 0.2, 0.7, 0.6, 12))
    expect(box).toBeDefined()
    expect(box!.h).toBeGreaterThan(0.5)
  })

  it('ignores a speck of dirt in the margin', () => {
    const clean = inkBox(linesOfText(page(200, 260), 0.3, 0.3, 0.4, 0.4))
    const specked = linesOfText(page(200, 260), 0.3, 0.3, 0.4, 0.4)
    ink(specked, 0.03, 0.9, 0.012, 0.012)
    const dirty = inkBox(specked)
    expect(clean).toBeDefined()
    expect(dirty).toBeDefined()
    // A single speck must not drag the box to the edge of the photo.
    expect(dirty!.x).toBeCloseTo(clean!.x, 1)
    expect(dirty!.y + dirty!.h).toBeCloseTo(clean!.y + clean!.h, 1)
  })

  it('ignores the table the page is lying on', () => {
    // The bug this two-stage detector exists for. A worktop is DARKER than print, so a
    // single threshold over the whole frame counts the table as ink, the box grows to the
    // edges, and the suggestion is worthless. Find the paper first, then the print on it.
    const shot = onTable(320, 400)
    linesOfText(shot, 0.28, 0.3, 0.44, 0.36, 9)
    const box = inkBox(shot)
    expect(box).toBeDefined()
    // The text block, not the sheet and certainly not the whole photograph.
    expect(box!.x).toBeGreaterThan(0.2)
    expect(box!.x + box!.w).toBeLessThan(0.8)
    expect(box!.y).toBeGreaterThan(0.24)
    expect(box!.y + box!.h).toBeLessThan(0.75)
  })

  it('says nothing when there is barely any paper in shot', () => {
    // Mostly table with a corner of a page: boxing a highlight would be a guess.
    const shot = onTable(320, 400, 0.1)
    expect(inkBox(shot)).toBeUndefined()
  })

  it('says nothing about a blank page', () => {
    expect(inkBox(page(200, 260))).toBeUndefined()
  })

  it('says nothing when the photo is mostly dark', () => {
    // A dark room or a black-background spread: there are no margins to trim, and a
    // confident box here would be a guess dressed as an answer.
    expect(inkBox(ink(page(200, 260), 0, 0, 1, 0.8))).toBeUndefined()
  })

  it('says nothing when the ink already fills the frame', () => {
    // She framed it tightly herself. Suggesting "the whole photo" is not a suggestion.
    expect(inkBox(linesOfText(page(200, 260), 0.01, 0.01, 0.98, 0.98, 20))).toBeUndefined()
  })

  it('refuses a malformed image rather than guessing', () => {
    expect(inkBox({ data: new Uint8Array(10), width: 100, height: 100 })).toBeUndefined()
    expect(inkBox(page(4, 4))).toBeUndefined()
  })

  it('returns a rectangle that stays inside the photo', () => {
    // Padding must never push the box off the edge — prepareImage would crop past the bitmap.
    const box = inkBox(linesOfText(page(200, 260), 0.0, 0.0, 0.5, 0.5))
    expect(box).toBeDefined()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.w).toBeLessThanOrEqual(1)
    expect(box!.y + box!.h).toBeLessThanOrEqual(1)
  })
})
