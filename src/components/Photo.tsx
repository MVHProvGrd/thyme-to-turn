import { useObjectUrl } from './useObjectUrl'

/**
 * A stored photo, or the space where one would be. Presentational: the screen fetches the
 * blob through repo.ts and hands it here, because components never touch the database.
 *
 * The placeholder keeps its slot when there is no photo, so a list of recipes doesn't
 * jitter between rows that have one and rows that don't.
 */
export default function Photo({
  blob,
  alt,
  className = '',
  fallback,
}: {
  blob: Blob | undefined
  alt: string
  className?: string
  fallback?: string
}) {
  const url = useObjectUrl(blob)

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-rule bg-card ${className}`}
    >
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : fallback ? (
        <span aria-hidden="true" className="font-mono text-[11px] text-ink-soft">
          {fallback}
        </span>
      ) : null}
    </span>
  )
}
