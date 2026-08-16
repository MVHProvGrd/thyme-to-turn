import type { ReactNode } from 'react'

/**
 * A settings section that stays shut until she wants it.
 *
 * Built on `<details>` rather than state: it keeps keyboard and screen-reader behaviour
 * for free, and it still works if the JavaScript hasn't finished loading. The summary
 * carries a count so the section says something useful while closed — "Staples · 12" is
 * a fact, "Staples ›" is a shrug.
 */
export default function Disclosure({
  title,
  note,
  children,
  defaultOpen = false,
}: {
  title: string
  /** The bit that makes the closed row worth reading — usually a count. */
  note?: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-sm border border-rule bg-card [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-[14px] py-3 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-thyme">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">{title}</span>
        <span className="flex items-center gap-2">
          {note ? <span className="font-mono text-[11px] text-ink-soft">{note}</span> : null}
          <span aria-hidden="true" className="font-mono text-xs text-ink-soft transition-transform group-open:rotate-90">
            ›
          </span>
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-rule px-[14px] py-[14px]">{children}</div>
    </details>
  )
}

/** A 44px checkbox row. Long lists want rows, not pills — pills wrap into a wall. */
export function CheckRow({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  hint?: string
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-[18px] w-[18px] shrink-0 accent-thyme"
      />
      <span className="min-w-0 flex-1 font-mono text-[13px] text-ink">{label}</span>
      {hint ? <span className="shrink-0 font-mono text-[11px] text-ink-soft">{hint}</span> : null}
    </label>
  )
}
