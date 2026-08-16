/**
 * Handing photos and text to another app on the phone. Behind the platform seam like every
 * other browser API, so screens never reach for `navigator` themselves.
 *
 * This exists because of a real trap in the bring-your-own-AI path: a photo taken through
 * `<input capture>` on iOS is handed to the page and is NOT saved to her camera roll. The
 * instructions cheerfully said "give it your photo of the page" while the photo lived only
 * inside this app, where no other app could reach it. Without a share sheet she could
 * genuinely not attach the page she had just photographed.
 *
 * This shares to an app SHE picks from the system sheet. It is not a publish, an upload or
 * an account — nothing leaves the phone until she chooses a destination (non-negotiable 8).
 */

export type ShareResult = 'shared' | 'cancelled' | 'unsupported'

/** Can this browser put actual files into the share sheet? Desktop mostly cannot. */
export function canShareFiles(files: File[]): boolean {
  const share = navigator.share as ((data: ShareData) => Promise<void>) | undefined
  const canShare = navigator.canShare as ((data: ShareData) => boolean) | undefined
  if (!share || !canShare) return false
  try {
    return canShare({ files })
  } catch {
    return false
  }
}

/**
 * Open the system share sheet. MUST be called straight out of a tap — iOS refuses a share
 * that arrives after an await the user did not see, so prepare the files first.
 *
 * A cancel is reported as `cancelled`, not as an error: backing out of the sheet is a
 * normal thing to do and must not raise a red message.
 */
export async function shareFiles(files: File[], text: string, title: string): Promise<ShareResult> {
  if (!canShareFiles(files)) return 'unsupported'
  try {
    await navigator.share({ files, text, title })
    return 'shared'
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') return 'cancelled'
    return 'unsupported'
  }
}
