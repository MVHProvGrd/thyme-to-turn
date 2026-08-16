/**
 * "The Zuni Café Cookbook · Judy Rodgers · p.214"
 *
 * The line that makes the whole app an index into a shelf she already owns. Until phase 3
 * a recipe's source is free text, so this renders whatever she typed and does not pretend
 * to be a link to a book that doesn't exist yet.
 */
export default function SourceLine({
  citation,
  page,
  className = '',
}: {
  citation?: string
  page?: number
  className?: string
}) {
  const parts = [citation?.trim(), page ? `p.${page}` : undefined].filter(Boolean)
  if (parts.length === 0) return null
  return (
    <p className={`font-mono text-[11px] leading-[1.5] text-ink-soft ${className}`}>{parts.join(' · ')}</p>
  )
}
