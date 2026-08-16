import { NavLink } from 'react-router-dom'

/**
 * Top-level navigation. Adding a screen means adding a <Route> in App.tsx and an entry
 * here — two known places beats a screen that exists but can't be reached.
 *
 * Three equal tabs, Dinner first — it's the landing screen and the product.
 */
export const TABS = [
  { to: '/dinner', label: 'Dinner', match: ['/dinner'] },
  { to: '/recipes', label: 'Recipes', match: ['/recipes', '/recipe', '/edit', '/books', '/book'] },
  { to: '/settings', label: 'Settings', match: ['/settings'] },
]

export default function TabBar({ active }: { active: string }) {
  return (
    <nav className="flex shrink-0 border-t border-rule bg-paper" aria-label="Sections">
      {TABS.map((tab) => {
        const isActive = tab.match.some((prefix) => active.startsWith(prefix))
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            aria-current={isActive ? 'page' : undefined}
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
