/**
 * Reading a barcode off the back of a book, through the camera. THE NATIVE SEAM: nothing
 * outside platform/ knows whether the browser has `BarcodeDetector` or we had to ship a
 * decoder.
 *
 *   BarcodeDetector           Chrome / Android — native, fast, free
 *     ↓ not available
 *   @zxing/browser (lazy)     iOS Safari and everything else — ~200 KB, loaded on demand
 *     ↓ camera denied / nothing found
 *   manual entry              always visible on the screen; never hidden behind a link
 *
 * `BarcodeDetector` does NOT exist in Safari or any iOS browser (all WebKit), so for an
 * iPhone user the fallback is the primary path. Test it on the actual phone.
 *
 * Reports every code it sees; deciding which one is the ISBN (not the price add-on) is
 * lib/isbn.ts's job.
 */

export type StopScanning = () => void

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type DetectorCtor = new (options: { formats: string[] }) => Detector

/** Can this browser open a camera at all? Without one, only manual entry makes sense. */
export function hasCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

/**
 * Start the rear camera into `video` and call `onCodes` with whatever is read, as often
 * as it is read. Resolves once the stream is running; rejects if the camera is refused
 * (the screen shows the manual field either way). Call the returned function to stop —
 * on unmount, on success, on Back — or the camera light stays on.
 */
export async function startBarcodeScan(
  video: HTMLVideoElement,
  onCodes: (codes: string[]) => void,
): Promise<StopScanning> {
  const Native = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (Native) return startNative(Native, video, onCodes)
  return startZxing(video, onCodes)
}

async function startNative(
  Native: DetectorCtor,
  video: HTMLVideoElement,
  onCodes: (codes: string[]) => void,
): Promise<StopScanning> {
  const detector = new Native({ formats: ['ean_13', 'ean_8'] })
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
  video.srcObject = stream
  video.setAttribute('playsinline', 'true')
  await video.play()

  let live = true
  const tick = async () => {
    if (!live) return
    try {
      if (video.readyState >= 2) {
        const found = await detector.detect(video)
        if (found.length) onCodes(found.map((f) => f.rawValue))
      }
    } catch {
      // A frame that can't be read is not an error worth surfacing; the next one may.
    }
    if (live) setTimeout(tick, 200)
  }
  void tick()

  return () => {
    live = false
    for (const track of stream.getTracks()) track.stop()
    video.srcObject = null
  }
}

async function startZxing(video: HTMLVideoElement, onCodes: (codes: string[]) => void): Promise<StopScanning> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])
  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8])
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 200 })
  const controls = await reader.decodeFromConstraints(
    { video: { facingMode: { ideal: 'environment' } }, audio: false },
    video,
    (result) => {
      if (result) onCodes([result.getText()])
    },
  )
  return () => controls.stop()
}
