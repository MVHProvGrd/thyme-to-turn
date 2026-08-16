import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

/**
 * The bottom sheet from the handoff's component inventory (§6.8), finally built.
 *
 * Everything that used to be a browser `confirm()` comes through here. The native ones
 * were the only thing in the app that didn't look like the app: system font, system
 * chrome, the page's URL printed above the question, an OK button where the design says
 * the destructive action is copper. On a home-screen PWA they read as the app breaking
 * character.
 *
 * Bottom sheet rather than a centred dialog because the phone is held in one hand and the
 * buttons need to be under the thumb — same reason the primary action sits in the bottom
 * third everywhere else.
 */
export default function Sheet({
  open,
  onDismiss,
  title,
  children,
  actions,
}: {
  open: boolean
  /** Backdrop tap, Escape, or the close affordance. Always the SAFE outcome. */
  onDismiss: () => void
  title: string
  children?: ReactNode
  actions: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    // Focus the panel, not a button: landing on "Delete" and hitting space is not a
    // confirmation, it's an accident.
    panel.current?.focus()

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onDismiss()
        return
      }
      if (event.key !== 'Tab' || !panel.current) return
      // Keep Tab inside the sheet while it is up. Without this, tabbing walks off into the
      // page underneath, which is still there and still tappable-looking.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === panel.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* The page is still behind and still looks tappable, so cover it and mean it. */}
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onDismiss}
        className="absolute inset-0 bg-ink/40"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet-panel relative max-h-[85dvh] overflow-y-auto overscroll-contain border-t border-rule bg-card px-5 pb-8 pt-6 focus-visible:outline-none"
      >
        <h2 id={titleId} className="font-serif text-[21px] font-semibold leading-[1.25] text-ink">
          {title}
        </h2>
        {children ? <div className="pt-3">{children}</div> : null}
        <div className="flex flex-col gap-2 pt-6">{actions}</div>
      </div>
    </div>
  )
}
