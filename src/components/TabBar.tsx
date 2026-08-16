import { NavLink } from 'react-router-dom'

/**
 * Top-level navigation. Adding a screen means adding a <Route> in App.tsx and an entry
 * here — two known places beats a screen that exists but can't be reached.
 *
 * Three equal tabs, "Plan a meal" first — it's the landing screen and the product.
 *
 * The route stays `/dinner`: it's in bookmarks, in the `state.from` the detail screen
 * uses to find its way back, and it's shorter to type. A tab's label is what she reads;
 * the path is what the code holds onto, and the two don't have to agree.
 */
export const TABS = [
  { to: '/dinner', label: 'Plan a meal', match: ['/dinner'] },
  { to: '/recipes', label: 'Recipes', match: ['/recipes', '/recipe', '/edit', '/books', '/book'] },
  { to: '/settings', label: 'Settings', match: ['/settings'] },
]

export default function TabBar({
  active,
  onLeave,
}: {
  active: string
  /** Return false to cancel the tap, for a screen holding work that is not saved yet. */
  onLeave?: () => boolean
}) {
  return (
    <nav className="flex shrink-0 border-t border-rule bg-paper" aria-label="Sections">
      {TABS.map((tab) => {
        const isActive = tab.match.some((prefix) => active.startsWith(prefix))
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            aria-current={isActive ? 'page' : undefined}
            onClick={(event) => {
              // Already here: don't make her confirm leaving for a tap that goes nowhere.
              if (!isActive && onLeave && !onLeave()) event.preventDefault()
            }}
            className={`flex min-h-[56px] flex-1 items-center justify-center font-mono text-[11px] uppercase tracking-[0.1em] focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-thyme ${
              isActive
                ? 'font-semibold text-thyme shadow-[inset_0_2px_0_#7FB03F]'
                : 'font-normal text-ink-soft'
            }`}
          >
            {tab.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
