import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Save confirmations. Sits above the tab bar, dismisses itself after 2.2s, and never
 * carries an error — errors say what happened and what to do, in place, next to the thing
 * that failed.
 */
const ToastContext = createContext<(message: string) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((text: string) => {
    setMessage(text)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 2200)
  }, [])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none">
        {message ? (
          <div className="fixed inset-x-5 bottom-24 z-50 rounded-sm bg-ink px-4 py-[14px] font-mono text-xs text-paper">
            {message}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}
