import { describe, it, expect } from 'vitest'
import { newId, isValidId } from '../ids'

describe('ids — the identity rule (D3)', () => {
  it('mints a valid, unique id', () => {
    const a = newId()
    const b = newId()
    expect(isValidId(a)).toBe(true)
    expect(a).not.toBe(b)
  })

  it('rejects anything that is not one of ours', () => {
    // The specific thing this guards: an ISBN is never an id.
    expect(isValidId('9780393058970')).toBe(false)
    expect(isValidId('')).toBe(false)
    expect(isValidId(undefined)).toBe(false)
    expect(isValidId(42)).toBe(false)
  })
})
