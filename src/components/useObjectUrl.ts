import { useEffect, useState } from 'react'

/**
 * A displayable URL for a stored Blob, revoked when it goes away.
 *
 * The revoke is the whole point: a long list of covers or dish photos that mints object
 * URLs and never releases them leaks memory until iOS kills the tab. Presentational only —
 * the screen fetches the blob through repo.ts and hands it here.
 */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return url
}
