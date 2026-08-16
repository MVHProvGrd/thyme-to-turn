import { useLayoutEffect, useRef } from 'react'

/**
 * The one animation in the app: when the results re-rank, cards slide to their new place
 * (~180ms) instead of teleporting, so she can follow what her tap did. New cards fade in.
 *
 * FLIP with the Web Animations API — measure before, measure after, play the difference.
 * Positions are read as offsets from the container, not from the viewport, so scrolling
 * between taps doesn't look like every card moved. `enabled: false` (reduced motion) makes
 * it an instant swap.
 *
 * Mark each animated child with `data-flip-key`.
 */
export function useFlip<T extends HTMLElement>(enabled: boolean) {
  const containerRef = useRef<T>(null)
  const previous = useRef(new Map<string, { top: number; left: number }>())

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const next = new Map<string, { top: number; left: number }>()
    const seenBefore = previous.current.size > 0

    for (const el of container.querySelectorAll<HTMLElement>('[data-flip-key]')) {
      const key = el.dataset.flipKey
      if (!key) continue
      const now = { top: el.offsetTop, left: el.offsetLeft }
      next.set(key, now)
      if (!enabled || typeof el.animate !== 'function') continue

      const was = previous.current.get(key)
      if (was) {
        const dx = was.left - now.left
        const dy = was.top - now.top
        if (dx || dy) {
          el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
            duration: 180,
            easing: 'ease-out',
          })
        }
      } else if (seenBefore) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
      }
    }
    previous.current = next
  })

  return containerRef
}
