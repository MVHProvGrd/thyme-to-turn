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

## Status

**Phase 0** — it deploys. Next: storage and typing a recipe in.
