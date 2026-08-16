import type { IngredientState } from '../lib/pantry'

/**
 * The tri-state ingredient chip — the single most important component on the screen.
 *
 * She's standing at an open fridge, reading at arm's length, and must never hesitate over
 * what a chip means. So the state is never colour alone: `have` carries a ✓, `dontHave` a
 * strikethrough. That is what makes the grid usable for a red-green colourblind cook.
 *
 * The chip owns no state. The screen decides what a tap does — on the dinner screen the
 * open tab decides whether a tap means "out of it" or "got it", in Settings it toggles a
 * staple — because these taps mean different things in different places. Spec: HANDOFF.md
 * §2, minus the tri-state cycle (see docs/design/README.md).
 */

const STATE_CLASS: Record<IngredientState, string> = {
  unknown: 'bg-card border-rule text-ink font-normal',
  have: 'bg-leaf/[0.16] border-transparent text-thyme font-semibold',
  dontHave: 'bg-copper/[0.12] border-transparent text-copper line-through decoration-[1.5px]',
}

const STATE_WORD: Record<IngredientState, string> = {
  unknown: 'not marked',
  have: 'have',
  dontHave: 'ruled out',
}

/** Chips are the ONLY place text truncates in the app: 13 characters plus an ellipsis. */
export function shortLabel(name: string): string {
  return name.length > 14 ? `${name.slice(0, 13)}…` : name
}

export default function Tile({
  name,
  state,
  onTap,
  emoji,
  ariaLabel,
  disabled = false,
}: {
  /** The full canonical name; the visible label may be shortened, the accessible one never is. */
  name: string
  state: IngredientState
  onTap: () => void
  emoji?: string
  /** Override for places where "ruled out" is the wrong word (Settings: "a staple"). */
  ariaLabel?: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      aria-label={ariaLabel ?? `${name}, ${STATE_WORD[state]}`}
      title={name.length > 14 ? name : undefined}
      className={`inline-flex min-h-[44px] max-w-full items-center gap-[6px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-[14px] font-mono text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme disabled:pointer-events-none disabled:border-rule disabled:bg-card disabled:text-ink-soft disabled:opacity-50 disabled:no-underline ${STATE_CLASS[state]}`}
    >
      {state === 'have' ? <span aria-hidden="true">✓</span> : null}
      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
      <span className="overflow-hidden text-ellipsis">{shortLabel(name)}</span>
    </button>
  )
}
