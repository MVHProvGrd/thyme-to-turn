import type { ReactNode } from 'react'

/** One line, one action. Never an apology, never an "Oops". */
export default function EmptyState({ line, action }: { line: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-sm border border-rule bg-card px-5 py-8 text-center">
      <p className="max-w-[30ch] font-serif text-[19px] leading-[1.3] text-ink">{line}</p>
      {action}
    </div>
  )
}
