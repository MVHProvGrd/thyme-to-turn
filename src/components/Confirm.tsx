import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Sheet from './Sheet'
import Button from './Button'

/**
 * "Are you sure?", in the app's own voice.
 *
 * A promise, so every call site keeps the shape it already had:
 *
 *   if (!confirm('Delete?')) return        →    if (!(await ask({ ... }))) return
 *
 * Two rules the native dialog could not follow and this one does:
 *
 *   THE SAFE ANSWER IS THE DEFAULT. Escape, the backdrop, and the back-of-the-hand tap all
 *   resolve false. Nothing is destroyed by dismissing a question.
 *
 *   DESTRUCTIVE LOOKS DESTRUCTIVE. `copper` is hazard-only in this app, and a browser
 *   dialog cannot say that. Deleting everything and merging two ingredients should not
 *   wear the same button.
 */
export type ConfirmOptions = {
  title: string
  /** A sentence of consequence. What happens, and what does not. */
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Paints the confirm button copper. For anything that loses data. */
  destructive?: boolean
}

type Pending = { options: ConfirmOptions; resolve: (answer: boolean) => void }

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(async () => false)

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  // The element that opened the sheet, so focus goes back where she left it.
  const opener = useRef<Element | null>(null)

  const ask = useCallback((options: ConfirmOptions) => {
    opener.current = document.activeElement
    return new Promise<boolean>((resolve) => setPending({ options, resolve }))
  }, [])

  function answer(value: boolean) {
    pending?.resolve(value)
    setPending(null)
    if (opener.current instanceof HTMLElement) opener.current.focus()
  }

  const options = pending?.options

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Sheet
        open={pending !== null}
        onDismiss={() => answer(false)}
        title={options?.title ?? ''}
        actions={
          <>
            <Button
              variant={options?.destructive ? 'destructive' : 'primary'}
              onClick={() => answer(true)}
            >
              {options?.confirmLabel ?? 'Yes'}
            </Button>
            <Button variant="secondary" onClick={() => answer(false)}>
              {options?.cancelLabel ?? 'Cancel'}
            </Button>
          </>
        }
      >
        {options?.body ? (
          <p className="font-mono text-xs leading-[1.7] text-ink-soft">{options.body}</p>
        ) : null}
      </Sheet>
    </ConfirmContext.Provider>
  )
}
