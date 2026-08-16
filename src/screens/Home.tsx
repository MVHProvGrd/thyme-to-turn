import { APP_NAME, APP_TAGLINE } from '../lib/app'

/**
 * Phase 0's entire job: prove the pipeline. A page that is hers, at a URL that is hers,
 * built and deployed from `main` by the workflow, installable to a home screen.
 *
 * Phase 1 replaces this with the recipe list.
 */
export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-leaf">
        Phase 0 · it deploys
      </p>
      <h1 className="text-5xl sm:text-6xl leading-[0.95] tracking-tight text-thyme text-balance">
        {APP_NAME}
      </h1>
      <span aria-hidden className="my-1 h-px w-24 bg-leaf/50" />
      <p className="italic text-lg text-ink-soft max-w-[28ch]">{APP_TAGLINE}</p>
      <p className="mt-6 font-mono text-xs text-ink-soft/70">
        Next: storage, and typing a recipe in.
      </p>
    </main>
  )
}
