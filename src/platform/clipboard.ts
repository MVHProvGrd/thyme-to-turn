/**
 * Copying to the clipboard. Behind the platform seam like everything else that touches a
 * browser API, so screens never reach for `navigator` themselves.
 *
 * The fallback matters: `navigator.clipboard` needs a secure context and is refused
 * outright by some in-app browsers, and the whole point of the text being copied is that
 * she is about to paste it somewhere else. Failing silently would be the worst outcome.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Denied or unavailable — fall through to the old way.
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}
