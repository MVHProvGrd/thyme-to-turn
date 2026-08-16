/**
 * The parse model is a price knob, so the thing worth pinning down is the FALLBACK: an
 * empty phone, or a stored value from a model that no longer exists, must land on the
 * cheap one rather than silently spending six times as much per recipe.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PARSE_MODEL, PARSE_MODELS, getParseModel, parseModelLabel, setParseModel } from '../claude'

describe('which model reads the page', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts on the cheap one', () => {
    expect(getParseModel()).toBe('claude-haiku-4-5')
    expect(DEFAULT_PARSE_MODEL).toBe('claude-haiku-4-5')
  })

  it('remembers a choice she made', () => {
    setParseModel('claude-opus-5')
    expect(getParseModel()).toBe('claude-opus-5')
  })

  it('falls back to the cheap one when the stored id is not offered any more', () => {
    localStorage.setItem('parseModel', JSON.stringify('claude-3-haiku-20240307'))
    expect(getParseModel()).toBe(DEFAULT_PARSE_MODEL)
  })

  it('offers exactly one cheap read and one careful one, each with a price', () => {
    expect(PARSE_MODELS).toHaveLength(2)
    for (const model of PARSE_MODELS) {
      expect(model.cost).toMatch(/cent/)
      expect(parseModelLabel(model.id)).toBe(model.label)
    }
  })

  it('shows an unknown id as itself rather than pretending to know it', () => {
    expect(parseModelLabel('claude-something-new')).toBe('claude-something-new')
  })
})
