# Thyme to Turn

A private, offline-first cookbook app. Photograph a recipe page, scan the book's barcode,
and get a searchable collection that always points back to the physical page it came from.

The screen it exists for: **mark what you're out of, and find out what's for dinner.**

- Everything stays on the device. No accounts, nothing published, no backend to run.
- Works in airplane mode. Installs to a phone home screen.
- Every recipe cites its book and page — an index into a shelf, not a replacement for it.

## Running it

```bash
npm install
npm run dev        # local dev server
npm run check      # typecheck + tests + build — run this before every commit
```

`npm run preview` binds IPv4 explicitly; without that it fails with `EAFNOSUPPORT :::4173`
in some sandboxes.

## Where things live

`src/lib/` is pure — no React, no database, no network — and holds the logic worth testing.
`src/platform/` is the only place that touches browser APIs, which is what keeps a native
wrapper possible later. `src/db/repo.ts` is the only writer. The import rules are enforced
by a test (`src/lib/__tests__/architecture.test.ts`), not by convention.

`CLAUDE.md` is the working guide and the single source of truth for conventions. Planning
docs live in `MVHProvGrd/imageweaver-workbench` under `docs/cookbook-app/`.

## Deploying

Pushes to `main` build and deploy to GitHub Pages automatically.

**One-time setup, already done or needs doing once:** Settings → Pages → Build and
deployment → Source: **GitHub Actions**. The workflow can't turn this on for itself — the
`GITHUB_TOKEN` lacks the scope to create a Pages site, which fails as
`Resource not accessible by integration`.

Live at https://mvhprovgrd.github.io/thyme-to-turn/

## Status

**Phase 1 — storage, and typing a recipe in.**

You can add a recipe by hand, cook from it, and get it back out again:

- **Recipes** — add, edit, and search by title, book, tag or ingredient.
- **Cook mode** — steps step up to arm's-length size; tap one to keep your place.
- **Settings → Export as JSON** — the whole collection in one file you can email yourself.
  Import upserts by ID, so importing the same file twice changes nothing.

It lives in IndexedDB on the device, and the app asks the browser to keep it
(`storage.persist()`). There is no server and no copy anywhere else — **export before any
update that changes the schema.**

Next: **phase 2, the dinner screen** — mark what you're out of, see what you can still
cook. That's the one the app exists for. Its design is in `docs/design/`.
