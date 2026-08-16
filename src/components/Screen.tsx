import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import TabBar from './TabBar'

/**
 * The app shell: a fixed header, one scrolling region beneath it, and the tab bar pinned
 * to the bottom. `100dvh` rather than `100vh` — iOS Safari's toolbar makes `vh` lie, and
 * the bottom of the app is where the primary action lives.
 *
 * THE TAB BAR IS ON EVERY SCREEN, including the nested ones (a book, an edit form, the
 * camera). Alisa asked for it (2026-08-16) and she is right: a screen you can only leave
 * by finding the one back arrow you happen to be looking at is a screen you can get stuck
 * in. `tabs` is kept as an escape hatch but nothing passes it today.
 *
 * `onLeave` is what makes that safe on the two screens holding work that is not saved yet.
 * Return false and the tap is cancelled. Without it, one stray thumb on "Dinner" would
 * silently bin a parse she has not checked yet — see RecipeParse and RecipeEdit.
 */
export default function Screen({
  header,
  children,
  tabs = true,
  onLeave,
}: {
  header?: ReactNode
  children: ReactNode
  tabs?: boolean
  /** Return false to cancel a tab tap — for screens holding unsaved work. */
  onLeave?: () => boolean
}) {
  const { pathname } = useLocation()
  return (
    <div className="flex h-dvh flex-col bg-paper">
      {header ? <div className="shrink-0 border-b border-rule">{header}</div> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      {tabs ? <TabBar active={pathname} onLeave={onLeave} /> : null}
    </div>
  )
}

/** The standard screen header: an H1 and an optional action on the right. */
export function ScreenHeader({
  title,
  action,
  sub,
}: {
  title: string
  action?: ReactNode
  sub?: ReactNode
}) {
  return (
    <div className="px-5 pb-[14px] pt-[22px]">
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-serif text-[27px] font-semibold leading-[1.1] tracking-[-0.01em] text-thyme">
          {title}
        </h1>
        {action}
      </div>
      {sub ? <p className="mt-2 font-mono text-xs text-ink-soft">{sub}</p> : null}
    </div>
  )
}
