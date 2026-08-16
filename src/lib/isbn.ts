/**
 * ISBN handling. PURE, and tested, because a misread digit that silently creates a junk
 * book record is the single most common capture bug — and ten lines of checksum catch it.
 *
 * ISBNs are external references (D3): they find a book and detect a duplicate, they are
 * never a key. Stored as digits only, no hyphens.
 */

/** Strip hyphens, spaces and an "ISBN:" prefix; uppercase a trailing x. */
export function normalizeIsbn(text: string): string {
  // (No `[…:…]` character class here: Tailwind scans .ts files for class names and turned
  // one into a CSS rule that broke the build.)
  return text
    .replace(/^\s*isbn(?:-1[03])?:?/i, '')
    .replace(/[\s-]/g, '')
    .toUpperCase()
}

/** True for a 13-digit code with a valid EAN checksum in the book ranges (978 / 979). */
export function isValidIsbn13(text: string): boolean {
  const s = normalizeIsbn(text)
  if (!/^97[89]\d{10}$/.test(s)) return false
  return checkDigit13(s.slice(0, 12)) === s[12]
}

function checkDigit13(twelve: string): string {
  let sum = 0
  for (let i = 0; i < 12; i += 1) sum += Number(twelve[i]) * (i % 2 === 0 ? 1 : 3)
  return String((10 - (sum % 10)) % 10)
}

/** ISBN-10 → ISBN-13, or undefined if the ten digits don't check out. */
export function isbn10to13(text: string): string | undefined {
  const s = normalizeIsbn(text)
  if (!/^\d{9}[\dX]$/.test(s)) return undefined
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(s[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  const expected = check === 10 ? 'X' : String(check)
  if (s[9] !== expected) return undefined
  const twelve = `978${s.slice(0, 9)}`
  return twelve + checkDigit13(twelve)
}

/**
 * From whatever the scanner (or she) produced, the one ISBN-13 worth keeping — or
 * nothing. Books carry a second, smaller barcode (the price add-on); a shelf in frame
 * yields several codes; a typed ISBN-10 is fine. Only a checksum-valid book code passes.
 */
export function pickIsbn(codes: string[]): string | undefined {
  for (const code of codes) {
    if (isValidIsbn13(code)) return normalizeIsbn(code)
  }
  for (const code of codes) {
    const converted = isbn10to13(code)
    if (converted) return converted
  }
  return undefined
}
