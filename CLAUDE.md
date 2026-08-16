# Thyme to Turn — project guide for Claude

Private, offline-first cookbook app for Alisa. Photograph a recipe page → structured
recipe. Scan a book's barcode → book record. Every recipe points back to <book, page>.

**Alisa is new to coding.** Explain what you're doing in plain words, one change at a
time. Prefer boring, obvious code over clever code. When you hit a real decision, say what
you'd pick and why, then do it — don't hand her a menu of five options.

Full planning docs live in `MVHProvGrd/imageweaver-workbench` under `docs/cookbook-app/`
on branch `claude/cookbook-app-project-plan-kpmcth`. This file is the operating summary;
that is the reasoning. Read `00-PROJECT-PLAN.md` before starting a new phase.

## Non-negotiables

1. **`main` is production.** Push to `main` (or a short-lived branch that merges within a
   session). GitHub Pages deploys from `main`. If `main` is broken, fixing it is the only
   task. Never leave the deployed app broken at the end of a session.
2. **Own IDs.** Every recipe and book gets `crypto.randomUUID()` at creation. It's the
   primary key and it never changes. ISBN lives in `externalRefs` and is never a key.
3. **Additive migrations only.** Never edit a shipped `db.version(n)` block; add
   `version(n+1)`. New fields are optional and read with `?? default`. No destructive
   fallback. **Before merging any schema change, tell Alisa to export her data first.**
4. **No API key in the repo, ever.** Her Claude key lives in browser local storage,
   entered via Settings. Never in a committed file, a `.env`, a build output, a commit
   message, or this file. Before any commit that touched `api/`, run:
   `git grep -n "sk-ant"` — it must return nothing.
5. **The verification gate is mandatory.** An AI-parsed recipe lands in an editable form
   with `verified: false` and is NOT written to the database until Alisa presses Save.
   Never write a parse result straight to storage.
6. **Never delete or overwrite her data to fix a bug.** If a migration might lose rows,
   stop and ask.
7. **Don't put the model identifier in commits, PRs, code, or committed files.** Chat only.
8. **No sharing/publishing features** unless she asks for one in the current session
   (see `05-SOURCES-AND-RIGHTS.md`).

## Stack

Vite + React + TypeScript · Tailwind · react-router-dom (**HashRouter** — GitHub Pages has
no rewrites) · Dexie/IndexedDB · vitest · Playwright for UI checks · vite-plugin-pwa.

App name is **Thyme to Turn**; the manifest carries `"short_name": "Thyme"` because iOS
truncates home-screen labels around 11–12 characters. The name lives in exactly one
constant plus the manifest — don't scatter the literal (WordWeft's parked-domain incident).

## Layout and import rules

```
src/lib/        PURE. No React, no Dexie, no fetch, no window. All unit tests live here.
src/platform/   Browser APIs (camera, barcode, blob storage, clock). THE NATIVE SEAM.
src/db/         schema.ts, db.ts, repo.ts (the ONLY writer), backup.ts
src/api/        claude.ts, openlibrary.ts, key.ts — the only files that make network calls
src/screens/    one file per screen, UI only
src/components/ shared presentational pieces; no db/api/platform imports
```

- Screens never touch Dexie directly — go through `db/repo.ts`.
- Screens never touch `navigator.*` directly — go through `platform/*`.
- `lib/` imports nothing but `lib/`. This is what keeps it testable.
- **Enforced by a test, not lint config**: `src/lib/__tests__/architecture.test.ts` reads
  every source file and fails on a forbidden import. It runs with `npm test`, survives a
  change of linter, and can't quietly drift from this file. To break a rule, change it here
  *and* in that test, in the same commit.

## What exists right now

Phase 1 is done — storage, and typing a recipe in.

```
lib/        types.ts · ids.ts · ingredients.ts · search.ts · backup-format.ts
platform/   clock.ts · prefs.ts · files.ts
db/         schema.ts (v1) · db.ts · repo.ts · backup.ts
screens/    RecipeList · RecipeDetail (cook mode) · RecipeEdit · Settings
components/ Screen · TabBar · Button · Field · Toast · SourceLine · EmptyState
```

Phase 2 is the dinner screen: `lib/pantry.ts`, the tri-state `Tile`, and a `/dinner` route
that becomes the landing screen and the third tab. The design for it is in `docs/design/`
— `HANDOFF.md` is the build spec, `designspec.md` is the intent, and `README.md` lists
where this build knowingly differs and why.

Conventions worth keeping:

- **`raw` is never rewritten.** Parsed `quantity`/`unit`/`item`/`canonical` are conveniences
  layered on the printed string; every view falls back to `raw`.
- **`repo.ts` maintains every derived field** — `canonical`, `ingredientIndex`, `seenCount`.
  Nothing else writes them, and `seenCount` is recounted rather than incremented so it
  can't drift.
- **Units are stored singular and displayed plural** (`formatUnit`). Storage matches;
  display reads like a person wrote it.
- **Import is upsert-by-uuid.** The test that matters is that importing the *same* file
  twice changes nothing: `src/db/__tests__/roundtrip.test.ts`.

## Commands

```bash
npm run dev        # local dev server
npm run check      # typecheck + tests + build — THE one to run before every commit
npm run typecheck  # tsc -b  (NOT `tsc --noEmit` — see gotchas)
npm test           # vitest run
npm run preview    # already pinned to --port 4173 --host 127.0.0.1
node shot.mjs      # drives the real app in Chromium, writes shots/*.png (needs preview up)
```

`vite preview` must bind IPv4 or it fails with `EAFNOSUPPORT :::4173` in this sandbox.

**Before every commit: typecheck + tests + build. All three.** No exceptions.

## Verifying UI changes

Headless Chromium is preinstalled at `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
Do **not** run `playwright install`. Drive the real app, screenshot it, and read the
screenshot back with the Read tool — don't declare a UI change done from the diff alone.

`shot.mjs` in the repo root does this: it types three recipes in through the real form at
390×844, then shoots the list, edit, detail, cook mode, settings and a post-reload check.
Extend it when a screen lands. Output goes to `shots/`, which is gitignored.

Chromium in this sandbox **cannot reach the live github.io URL** (`ERR_CONNECTION_RESET`)
even though `curl` can. Verify the deployed site with `curl` for status codes and the
`<title>`, and screenshot the identical build from `npm run preview` — don't claim to have
seen the live page.

## Data model quick reference

- `recipes`: uuid PK · `source: {kind, bookUuid?, pageStart?}` · `ingredients[].raw` is
  **verbatim page text** and is never overwritten by the parsed quantity/unit/item ·
  `ingredients[].canonical` is the pantry-match key · `ingredientIndex: string[]` holds
  **`ingredients` registry uuids**, maintained by `repo.ts` on every write · `notes` is
  HERS — the parser must never write to it · `verified: boolean`
- `ingredients`: uuid PK · `canonical`, `aliases[]`, `isStaple`, `seenCount` — the registry
  everything else references. Self-populating on write; mergeable by hand in Settings
- `books`: uuid PK · `externalRefs.isbn13` indexed (for duplicate detection, not identity)
  · cover stored as a downloaded blob, never a hot-linked URL
- `photos`: blobs keyed by uuid, downscaled to ≤2000px long edge on capture.
  `kind: 'page'` is EVIDENCE — crop non-destructively (keep the original blob + a `crop`
  rect), because it's the only record of what the page said when a parse was wrong.
  `kind: 'dish'` is hers — destructive crop is fine, and the first one is the thumbnail
- Export = `manifest.json` + json tables + `photos/`. **Phase 1 ships it as a single JSON
  file** with that manifest as an envelope — there are no photos yet and one file she can
  email herself beats a zip she has to unpack. Phase 4 wraps the same object in a zip.
- Import **upserts by uuid** — never appends. The round-trip test
  (`export → wipe → import → import again`) must pass.
- **`isStaple` is deliberately not a Dexie index.** IndexedDB can't key on a boolean, so
  Dexie silently leaves those rows out and the filter looks like it works while returning
  nothing. The registry is small; filter it in memory.

## Claude API call (`src/api/claude.ts`)

- Model `claude-opus-5`; `max_tokens: 8000` (thinking is on by default and shares the cap).
- Use Structured Outputs: `output_config: { format: { type: 'json_schema', schema } }`.
  Not top-level `output_format` (deprecated), not "reply with only JSON" + regex.
- **No assistant-turn prefill** (400s). **No `temperature`/`top_p`/`top_k`** (rejected).
- Images before the text block in the content array.
- Check `response.stop_reason` before reading `content` — a `refusal` returns HTTP 200
  with empty content.
- `dangerouslyAllowBrowser: true` is required and is only acceptable because the key is
  hers and the page loads zero third-party scripts. **Never add a CDN script, analytics,
  or an embed to this app.**
- Never re-parse a photo automatically. Re-parse is a button she presses.

## Open Library (`src/api/openlibrary.ts`)

Free, no key. `GET https://openlibrary.org/api/books?bibkeys=ISBN:<isbn13>&format=json&jscmd=data`.
Send a descriptive `User-Agent` with a contact address. **One lookup per book, ever** —
cache the result in the `books` table and never re-fetch. Validate the ISBN-13 checksum
before calling.

## Pantry search (`lib/pantry.ts`, `lib/ingredients.ts`)

The point of the app. Two ways in, one engine:

- **Two filters, both live at once — no mode toggle.** Every ingredient is
  `have` / `dontHave` / `unknown` for the session. Typing sets `have`; tapping a tile
  cycles `dontHave → have → unknown`. Do NOT build two screens, two match functions, or a
  direction picker.
- **`unknown` means unknown.** Never score an unmarked ingredient as missing. `dontHave`
  is reliable *and* complete (she knows what she's out of); `have` is reliable but
  *incomplete* (three typed items ≠ an empty kitchen). Conflating them is the bug that
  makes the screen untrustworthy.
- **Two counts per recipe, never one:** `missing` (ruled out — hard) and `unsure`
  (unmentioned — soft). Sort by `missing`, then `unsure`. Show them differently on the
  card: `missing: cream` vs `not sure: shallots, thyme`. **A `have` mark must never
  increase any recipe's `missing` count** — that's the regression test.
- `onlyWhatIListed` is a **checkbox** that collapses `unsure` into `missing`, for the
  bare-cupboard case. Not a mode.
- **Tap-out grid is the primary surface.** Recall ("what's in my fridge") is hard and
  incomplete; recognition ("do you have parmesan?") is easy. She's out of three things and
  has forty.
- **Grid order is information gain**, not alphabetical: offer the ingredient appearing in
  closest to half the remaining candidates, so each tap halves the field. Never offer a
  staple, an already-answered ingredient, or one no live recipe uses.
- **Session state only.** "Don't have chicken" and "not chicken tonight" are
  indistinguishable and, for narrowing, identical — so these taps are not facts about her
  kitchen and are never written into a standing pantry (D12).
- **No image pipeline for tiles.** Emoji where coverage is confident, a typographic tile
  otherwise. Generated ingredient art is not a v1 conversation.
- **Rank, never filter.** Three groups — ready now / one thing away / two things away —
  with the missing items named on each card. A strict filter returns nothing most nights.
- **Subtract staples before matching** — the `isStaple` flag on each registry entry.
  Without this every recipe reads as infeasible and the screen is always empty. Keep the
  flags visible and editable; wrong staples produce confidently wrong answers.
- **Skip `optional: true` ingredients.** Garnishes don't block feasibility.
- **A recipe with unresolved ingredient IDs is excluded from "ready to cook"** — never
  assumed feasible. Silence beats a confident wrong answer.
- **An ingredient registry, not a taxonomy.** The `ingredients` table holds one row per
  canonical ingredient — our `uuid`, canonical name, aliases, `isStaple` — and recipes
  store those **uuids** in `ingredientIndex`, never strings. `repo.ts` reconciles each
  parsed `canonical` on write: exact → alias → create. **Merging two entries repoints
  recipes and must never happen automatically** (`pepper` ≠ `bell pepper`). Hierarchy is
  the prefix convention only: pantry `chicken` matches `chicken thigh` via
  `startsWith("chicken ")` — mind the space, `chick` must not match. No categories, no
  parent/child fields, no tree.
- Matching is a **pure function over arrays**, tested before the screen exists.

## Known gotchas

- `BarcodeDetector` does **not** exist on iOS Safari (or any iOS browser — all WebKit).
  Lazy-import `@zxing/browser` as the fallback and test on an actual iPhone.
- Books often carry a second barcode: that's the price add-on, not the ISBN. Take the
  13-digit code starting `978`/`979`.
- Dexie `version(n).stores({})` must repeat the **full** index definition for every table
  it names — a partial `stores()` silently drops the indexes you omitted.
- Revoke `URL.createObjectURL` object URLs on unmount, or a long recipe list leaks memory
  and eventually kills the tab.
- Call `navigator.storage.persist()` on first run — iOS evicts IndexedDB under disk
  pressure, and her collection is hand-made with no re-download.
- `HashRouter`, not `BrowserRouter`. A hard refresh on a deep path 404s on Pages otherwise.
- Downscale photos to ≤2000px **before** storing and before sending to the API.
- **Pages must be enabled by hand once** (Settings → Pages → Source: GitHub Actions). Do
  not add `enablement: true` to `configure-pages` — the workflow token can't create a Pages
  site and it fails the whole build with `Resource not accessible by integration`.
- Typecheck is `npm run typecheck` (`tsc -b`), not `tsc --noEmit` — the root tsconfig is
  `files: []` with three project references (app / node / test), so a bare `--noEmit`
  silently checks nothing. Test files are their own project because they need node types
  that browser code must not have.
- A bare `pkill -f "vite preview"` exits 144 and **aborts the rest of a compound command**.
  Run kills on their own line.
- Playwright: the preinstalled Chromium is at
  `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Pass it as `executablePath` —
  `chromium.launch()` alone looks for a build that isn't there, and **never** run
  `npx playwright install`.

## Commit convention

- Small commits, one concern each. Run typecheck + tests + build first.
- Message: what changed and why, in a sentence a non-programmer can read.
- End with the `Co-Authored-By:` and `Claude-Session:` footers the harness provides.
- Never open a PR unless asked.
- Update this file in the same commit whenever architecture, conventions, or gotchas change.

## Backlog

Ideas that aren't being built right now go in `ROADMAP.md`, newest at top — not into the
current branch.
