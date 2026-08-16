/**
 * The re-rank on the dinner screen is the only animation in the app, and under
 * `prefers-reduced-motion: reduce` it must degrade to an instant swap.
 */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
