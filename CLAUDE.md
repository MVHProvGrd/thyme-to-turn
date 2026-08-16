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
src/seed/       the starter recipes (data + a lazy loader); imports only lib/ types
```

- Screens never touch Dexie directly — go through `db/repo.ts`.
- Screens never touch `navigator.*` directly — go through `platform/*`.
- `lib/` imports nothing but `lib/`. This is what keeps it testable.
- **Enforced by a test, not lint config**: `src/lib/__tests__/architecture.test.ts` reads
  every source file and fails on a forbidden import. It runs with `npm test`, survives a
  change of linter, and can't quietly drift from this file. To break a rule, change it here
  *and* in that test, in the same commit.

## What exists right now

Phases 1–4 are done: storage and typed entry, the dinner screen, books + photos, and
photo → recipe. **The live parse has never been run** — it needs Alisa's own API key, which
this project must never hold. Everything around it is tested; the call itself is not.

```
lib/        types.ts · ids.ts · ingredients.ts · search.ts · backup-format.ts
            pantry.ts (matchPantry · nextQuestions · shortlist · stateFor) · emoji.ts
            categories.ts · isbn.ts · books.ts · parse-result.ts · scale.ts
            pasted-parse.ts · ink.ts (find the print on a photographed page)
platform/   clock.ts · prefs.ts (localStorage prefs + sessionStorage marks) · files.ts
            motion.ts · barcode.ts (the scanner seam) · camera.ts (downscale + crop + findTextBox)
            clipboard.ts · share.ts (the system share sheet)
api/        openlibrary.ts — the only file that talks to Open Library
            key.ts (the ONLY place the secret is touched) · prompts.ts · claude.ts
db/         schema.ts (v1) · db.ts · repo.ts · backup.ts
screens/    Dinner (landing) · RecipeList · RecipeDetail (cook mode) · RecipeEdit · Settings
            BookList · BookScan · BookDetail · BookEdit · PhotoCrop · RecipeParse
components/ Screen · TabBar · Button · Field · Toast · SourceLine · EmptyState · Tile
            useFlip · useObjectUrl · Photo
seed/       starter.json (100 recipes) · index.ts (loader) · README.md (source, licence)
scripts/    fetch-starter.mjs — regenerates seed/starter.json from the Wikibooks Cookbook
```

`/dinner` is the landing route and the first of three tabs. The design for it is in
`docs/design/` — `HANDOFF.md` is the build spec, `designspec.md` is the intent, and
`README.md` lists where this build knowingly differs and why.

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
- **Starter recipes go through `saveRecipe`, never through import.** `importBackup`
  bulk-puts registry rows by uuid, so a seed shipped as a backup would bring a second
  `garlic` beside hers. `repo.addStarterRecipes` saves each draft (fixed uuid, `verified:
  false`) so ingredients reconcile against HER registry, and skips any uuid already on the
  device — pressing the button twice adds nothing and never overwrites one she edited.
  `removeStarterRecipes` deletes only rows with `source.license` set AND `verified: false`;
  an edited starter is hers now (`src/db/__tests__/starter.test.ts`).
- **`source.license` marks anything that isn't from her shelf** (`"CC BY-SA 4.0"` on the
  starter set; `"public-domain"` for a future Gutenberg import). Absent on her own recipes.
  Additive optional field, no Dexie change.
- **`SEEDED_STAPLES` includes the common spellings** — `kosher salt`, `extra-virgin olive
  oil`, `freshly-ground black pepper`, `all-purpose flour` — because with 100 real recipes
  those otherwise turn up as question tiles. Applied when an entry is first minted; hers
  to flip afterwards.
- **The comma is not always a note.** Both `normalize` and `parseIngredientLine` used to
  take the head of the first comma — right for "flour, sifted", catastrophic for
  "skinless, boneless chicken breasts", where the head is all adjectives. `normalize`
  returned the empty string and `parseIngredientLine` set `item: "skinless"` with the
  chicken filed away as the *note*, so the line matched nothing and the recipe was invisible
  to the pantry — on the one screen this app exists for. Both now take the **first
  comma-segment that still has a name in it** once quantities, units and preparations are
  stripped; where the head survives (the common case) nothing changed. `raw` is untouched
  either way.
- **`repo.mergeIngredients(from, into)` folds two registry entries into one**, and is the
  answer to registry noise — 100 starter recipes alone mint 559 entries, about a dozen of
  them some flavour of "stock". It repoints every affected recipe's `ingredientIndex`, keeps
  the folded-away name as an **alias** so the next recipe spelled that way resolves straight
  to the survivor, and ORs the staple flag (un-stapling by accident empties the dinner
  screen). Recipes are repointed, never deleted; their printed lines and their own
  `canonical` are untouched. **Never automatic** — `pepper` is not `bell pepper`, so it runs
  only when she picks both sides in Settings → "Duplicate ingredients". Two taps: fold away,
  then keep.
- **`repo.backfillCanonicals()` is how a normalizer fix reaches recipes already saved.**
  `canonical` is derived at write time, so improving the rule only helps recipes written
  afterwards — a fix nobody can apply to their own data is not a fix. It rewrites ONLY
  `canonical` and `ingredientIndex`, deliberately does not move `updatedAt` (repairing a
  derived field is not her editing the recipe), and is idempotent. Settings → "Re-check
  ingredient matching". Tested against non-negotiable 6 in `db/__tests__/backfill.test.ts`:
  raw, notes, title, steps and `verified` all come back untouched.
- **`normalize` strips instruction tails** (`to taste`, `as needed`, `if desired`, `for
  serving`…) with word boundaries, so "Salt to taste" is `salt`, not `salt taste`.

## Commands

```bash
npm run dev        # local dev server
npm run check      # typecheck + tests + build — THE one to run before every commit
npm run typecheck  # tsc -b  (NOT `tsc --noEmit` — see gotchas)
npm test           # vitest run
npm run preview    # already pinned to --port 4173 --host 127.0.0.1
node shot.mjs      # drives the real app in Chromium, writes shots/*.png (needs preview up)
node scripts/fetch-starter.mjs   # regenerate src/seed/starter.json (network; uuids kept)
```

`vite preview` must bind IPv4 or it fails with `EAFNOSUPPORT :::4173` in this sandbox.

**Before every commit: typecheck + tests + build. All three.** No exceptions.

## Verifying UI changes

Headless Chromium is preinstalled at `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`.
Do **not** run `playwright install`. Drive the real app, screenshot it, and read the
screenshot back with the Read tool — don't declare a UI change done from the diff alone.

`shot.mjs` in the repo root does this: it types four recipes in through the real form at
390×844, then shoots the list, edit, detail, cook mode, settings, a post-reload check, and
the dinner screen — cold start, three things tapped out, the card with both `missing` and
`not sure`, the detail rows saying `missing` / `✓`, the `+` flip, everything ruled out,
"only what I listed", staples in Settings — then loads the 100 starter recipes and shoots
the dinner screen with 104 (the question grid with real data) and a starter recipe's page.

Playwright's `getByRole(name)` is a substring match: with 22 chicken-ish tiles,
`{ name: 'chicken, not marked' }` needs `exact: true`. Extend it when a screen lands. Output goes to `shots/`, which is gitignored.

On a laptop without the sandbox Chromium, `shot.mjs` falls back to the installed Google
Chrome (`channel: 'chrome'`). Still never `playwright install`.

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
- **Books hang off Recipes, not a fourth tab.** The design is three equal tabs, and the
  primary way to a book is from a recipe's source line, not a browse. `/books` is reachable
  from the Recipes header.
- **Deleting a book never deletes a recipe.** Recipes that pointed at it keep their citation
  text and lose the `bookUuid` — "p.214" still means something. The confirm says so, because
  "delete" next to a list of her recipes is otherwise a frightening word.
- **A recipe stores its book's citation as text AND the uuid.** `repo.saveRecipe` fills the
  text from the book and `repo.saveBook` refreshes it on every linked recipe, so the source
  line, search and a backup all read right without a join and survive the book being deleted.
- **One lookup per book, ever.** `api/openlibrary.ts` is the only caller; the answer lives in
  the `books` table from then on. Covers are downloaded to blobs, never hot-linked, so the
  shelf works offline. Browsers forbid setting `User-Agent`, so the polite behaviour Open
  Library asks for is simply the caching.
- **Every object URL is revoked** (`useObjectUrl`). A list of covers or thumbnails that mints
  them and never releases them leaks until iOS kills the tab.
- **Scaling and unit preference are DISPLAY ONLY** (`lib/scale.ts`). `raw` and the stored
  quantity never move, so doubling a recipe cannot corrupt what the page said. Conversion
  goes volume→volume and weight→weight and REFUSES to cross: a cup of flour and a cup of
  water do not weigh the same, and that needs a density the app has no business guessing.
  A unit it cannot convert (bulb, clove, pinch) is left exactly as written.
- **Photos: dish crops destructively, page photos never do.** `repo.replacePhotoBytes`
  throws on a `page` photo. A dish photo is hers and a bad crop is fixable by taking another;
  a page photo is the only record of what page 214 said when a parse turns out wrong, so it
  gets a `crop` rect and keeps its pixels. Everything is downscaled to 2000px/q0.85 by
  `platform/camera.ts` BEFORE it is stored — don't lower it, that resolution is what makes a
  fraction glyph legible when the photo is the only source of truth left.
- **★ The verification gate is where a parse lives until she accepts it.** `RecipeParse`
  never writes a parsed recipe: the result travels to `RecipeEdit` in navigation state and
  only reaches `repo.saveRecipe` when she presses Save. Fields the model flagged get a
  copper rule so she checks those first. Do not "helpfully" auto-save a parse — a confident
  wrong answer is worse than no answer, and she finds out while creaming the butter.
  `RecipeEdit` reads the parse in its `useState` initialisers, so the route must MOUNT with
  the state present; a re-parse of a saved recipe deliberately does not overwrite the
  incoming fields with what is on disk.
- **The offline queue is an unverified recipe with page photos on it** — not a new table
  and not a schema change. "Keep the photos, read them later" saves the pages against an
  unverified recipe, and the recipe screen offers "Read the page" whenever there is signal.
  That button is always available once photos exist, including with no key at all, or she
  could photograph a page and have no way to keep it.
- **Re-parse is a button she presses.** Nothing re-sends a photo automatically and nothing
  costs money without a tap.
- **`ParsedRecipe` lives in `lib/types.ts`, the JSON schema in `api/prompts.ts`.** They
  mirror each other and change together; the type is in `lib/` because `lib/` may not
  import `api/` and the pure conversion (`lib/parse-result.ts`) needs it.
- **The prompt captures functional content only** — ingredients, method, yield, times — and
  is explicitly told to ignore the headnote and the author's prose. That is a rights
  posture as much as a product one (05-SOURCES-AND-RIGHTS.md), and it is not decoration.
- **The tab bar is on EVERY screen**, nested ones included — a book, an edit form, the
  camera, the parse screen. Alisa asked for it (2026-08-16) and she is right: a screen you
  can only leave by finding the one back arrow you happen to be looking at is a screen you
  can get stuck in. `Screen`'s `tabs` prop survives as an escape hatch but nothing passes it.
- **`Screen`'s `onLeave` is what makes that safe.** Return false and the tab tap is
  cancelled. Three screens hold work that is not on disk yet and all three use it:
  `RecipeParse` (photographed pages and a pasted reply live only in component state),
  `RecipeEdit` and `BookEdit`. Without it, one stray thumb on "Dinner" silently bins a parse
  she has not checked — the verification gate would be intact and the work gone anyway.
  Dirtiness is tracked from real DOM `onInput`/`onChange` on the form wrapper, NOT threaded
  through every setter: loading a recipe calls those setters too, and a form that marks
  itself dirty just by opening nags on every exit. An unsaved **parse** always asks, typed
  or not, because it is gone the moment the screen unmounts. Tapping the tab you are already
  on never asks.
- **The box is suggested, never applied silently.** Capture runs `platform/camera.ts`
  `findTextBox`, which hands a small greyscale copy to `lib/ink.ts` and gets back a
  rectangle. It is drawn into the draggable box with "Whole page" to undo and "Find the
  text" to retry. **Two stages, and the first is what makes it work on a real photograph**:
  a page sits on a worktop, and a dark table is darker than the print, so a single
  threshold over the whole frame counts the table as ink and the box grows to the edges.
  Find the PAPER first (the bright region), then the ink inside it — there is a regression
  test for exactly this (`ink.test.ts`, "ignores the table the page is lying on"). It finds
  INK, not TEXT: a photo on the page or a shadow in the gutter widens the box, which is
  precisely why she can always override it. Never auto-apply a crop to the SENT image
  without showing her the box first.
- **`navigator.share` is how pages leave the app** (`platform/share.ts`). This closes a real
  hole: a photo taken through `<input capture>` on iOS is handed to the page and is NOT
  saved to her camera roll, so "give it your photo of the page" was advice she could not
  follow — the only copy lived in IndexedDB. "Send to my AI" puts the boxed JPEGs and the
  instructions into the system sheet and she picks the app. The files are prepared in a
  `useEffect` BEFORE the tap, because iOS refuses a share that arrives after an await it
  did not see the user start. Desktop falls back to copy-the-prompt plus download. This is
  share-to-an-app-she-picks, not publish (non-negotiable 8) — and she asked for it
  explicitly (2026-08-16).
- **A JSON export cannot carry the recipe text.** Asked for "a single JSON to hand an
  external AI": reading the photo IS the job being outsourced, so there is nothing to put
  in the file until an AI or an OCR engine has read it. Base64 images in JSON are ~1 MB a
  page and cannot be pasted into a chat box. The answer is to share the IMAGES plus the
  prompt, which is what the share sheet does. Do not build a base64-in-JSON export.
- **A page photo's box says what is SENT, not what is stored** (`components/PageBox.tsx`).
  She drags a rectangle around the recipe; the whole page is saved with the box recorded as
  a `crop` rect on the `PhotoRef`, and only the boxed region goes to the model. Better parse,
  roughly half the image tokens, and the evidence survives. `CropRect` lives in
  `lib/types.ts` — a component may not import from `platform/`, and the architecture test
  will say so.
- **Categories are `tags`.** `Recipe.tags` has existed and been indexed (`*tags`) since
  v1 and was already in the search haystack, so categories shipped with **no migration and
  no new field on the recipe**. The vocabulary (presets + whatever she invents) is
  `settings.categories`, optional and read with a `?? PRESET_CATEGORIES` default so a
  settings row written before the feature still works. Assignments live on the recipe;
  removing a category from the vocabulary NEVER strips it from a recipe (non-negotiable 6)
  — an orphaned tag still shows on the recipe, is still searchable, and still appears in
  the list's filter row. Categories are a managed vocabulary over tags, not a new taxonomy;
  do not add a `category` field.
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
  `have` / `dontHave` / `unknown` for the session. Two **tabs** above the grid decide what
  a tap means — `Don't have` (copper, default, because ruling out is the primary gesture)
  and `Have` (leaf underline, thyme text — `leaf` never carries text). One tap marks; a
  second tap on the same tile clears it back to `unknown`. The `+` on a card's missing chip
  sets `have`. Replaced the tri-state tap cycle on 2026-08-16 — Alisa found up to three
  taps to say one thing intolerable, and `cycleState` is gone with it. Still ONE state
  model and ONE match function: the tabs are an input method, not a mode. Do NOT build two
  screens, two match functions, or a direction picker.
- **A tile marked in one tab is not offered as a question in the other** — `nextQuestions`
  already skips anything marked either way, and the answered row is filtered to the open
  tab. **Searching escapes the tabs**: typing a name shows every match in whatever state it
  is actually in, so she can always find a thing and change her mind from either tab.
  The text field only filters the tile grid — it never searches recipes.
- **`unknown` means unknown.** Never score an unmarked ingredient as missing. `dontHave`
  is reliable *and* complete (she knows what she's out of); `have` is reliable but
  *incomplete* (three typed items ≠ an empty kitchen). Conflating them is the bug that
  makes the screen untrustworthy.
- **Three counts per recipe:** `confirmed` (she has it), `missing` (ruled out — hard) and
  `notSure` (unmentioned — soft). **A `have` mark must never increase any recipe's
  `missing` count** — that's the regression test in `pantry.test.ts`.
- **Ranking order: fewest `missing`, then MOST `confirmed`, then fewest `notSure`, then
  title.** The `confirmed` key was learned the hard way (Alisa, 2026-08-16): with `notSure`
  first after `missing`, "fewest unknowns" means "simplest recipe", so marking beef, onion
  and carrot as `have` left a five-line chicken recipe on top and her three marks did
  nothing she could see — "so...wtf". Marking what she has is a statement about what she
  wants to cook **with**, and the ranking has to answer it. At cold start nothing is
  confirmed, so the key is inert and simplest-first is preserved exactly. `coverage` is no
  longer a sort key — once the other three tie it is arithmetically forced to tie too.
- **`notSure` ranks, it does not print.** Alisa asked for the `not sure: …` line to come
  off the result card (2026-08-16): at the fridge she reads what she is *out of*, and a
  list of things she never mentioned was noise. The card shows `missing:` chips only; the
  soft count is still computed and still the first tiebreak, so the order is unchanged.
  Do NOT respond to "the card only shows one number" by collapsing the two counts in
  `matchPantry` — that is the exact bug this whole file exists to prevent, and it is now
  *invisible* rather than merely wrong on screen. The honest reading of the group headers
  is now "nothing ruled out" / "one thing ruled out", not "everything confirmed".
- **`onlyWhatIListed` is gone** — the bare-cupboard checkbox was removed from both the
  screen and `matchPantry` (Alisa, 2026-08-16: she didn't want it). The engine takes no
  options now. `ROADMAP.md` records how it worked if it is ever wanted back.
- **Tap-out grid is the primary surface.** Recall ("what's in my fridge") is hard and
  incomplete; recognition ("do you have parmesan?") is easy. She's out of three things and
  has forty.
- **Grid order is information gain**, not alphabetical: answered tiles first (in the order
  she tapped them), then `nextQuestions()` — the ingredients appearing in closest to half
  the live candidates (recipes 0–1 away), so each tap halves the field. Never a staple, an
  already-answered ingredient, or one no live recipe uses. Twelve questions at a time;
  typing in the field searches the whole non-staple registry instead.
- **Session state only.** "Don't have chicken" and "not chicken tonight" are
  indistinguishable and, for narrowing, identical — so these taps are not facts about her
  kitchen and are never written into a standing pantry (D12). They live in
  **sessionStorage** (`platform/prefs.ts` `readSession`/`writeSession`), keyed by registry
  uuid: they survive opening a recipe and a mid-cooking reload, and die with the tab.
  Never move them to localStorage or IndexedDB.
- **No image pipeline for tiles.** Emoji where coverage is confident, a typographic tile
  otherwise. Generated ingredient art is not a v1 conversation.
- **Rank on `dontHave`; FILTER on `have`.** The two directions are not symmetric and this
  is the most-revised rule in the file, so read the reasoning before changing it:
  - **`dontHave` never filters.** Ruling things out is elimination, and a strict filter on
    it returns nothing most nights. Recipes 2+ away are counted in the tally, not listed.
  - **`have` filters** (`shortlist()` in `pantry.ts`). Once she has confirmed anything, the
    list is only recipes that use at least one confirmed ingredient. Alisa asked for this
    twice (2026-08-16): marking beef, onion and carrot and still seeing all 104 recipes
    under READY TO COOK made the marks feel decorative — "the whole point is to show me
    recipes WITH what I select". Saying what she has is a statement of intent, and unlike
    elimination it cannot empty the screen: every recipe it hides uses none of her picks.
  - `shortlist()` is **self-limiting** — if nothing she marked appears in any recipe, no
    match has a confirmed ingredient and it returns everything rather than nothing. Marking
    something obscure narrows the list; it can never blank it.
  - When the list is narrowed the tally says so — `"43 of 104 use what you have"` — rather
    than quietly showing 43 where there were 104.
- **Subtract staples before matching** — the `isStaple` flag on each registry entry.
  Without this every recipe reads as infeasible and the screen is always empty. The flags
  are visible and editable in Settings (the same `Tile`, `unknown`/`have` only, via
  `repo.setStaple`); wrong staples produce confidently wrong answers. A staple is never
  offered on the dinner grid — "I'm out of butter tonight" is a Settings change for now
  (see ROADMAP).
- **Skip `optional: true` ingredients.** Garnishes don't block feasibility.
- **A recipe with unresolved ingredient IDs is excluded from "ready to cook"** — never
  assumed feasible. Silence beats a confident wrong answer. (`matchPantry` drops it from
  the results entirely; it still counts in the "N recipes" tally.)
- **The recipe detail reads the same marks** (`stateForNames` in `pantry.ts`): a row she ruled
  out says `missing` in copper, a row she confirmed gets a leaf `✓`. Same engine, same
  alias/prefix resolution — never a second opinion. Detail reads the session marks once
  on open and never writes them.
- **The re-rank is the only animation in the app**: `components/useFlip.ts` slides result
  cards ~180ms with the Web Animations API, keyed by `data-flip-key`, and is switched off
  by `platform/motion.ts` `prefersReducedMotion()`. Nothing else moves.
- **An ingredient registry, not a taxonomy.** The `ingredients` table holds one row per
  canonical ingredient — our `uuid`, canonical name, aliases, `isStaple` — and recipes
  store those **uuids** in `ingredientIndex`, never strings. `repo.ts` reconciles each
  parsed `canonical` on write: exact → alias → create. **Merging two entries repoints
  recipes and must never happen automatically** (`pepper` ≠ `bell pepper`). Hierarchy is
  the prefix convention only: pantry `chicken` matches `chicken thigh` via
  `startsWith("chicken ")` — mind the space, `chick` must not match. No categories, no
  parent/child fields, no tree.
- **A line that says "or" is ONE requirement with SEVERAL answers.** "minced or ground lamb
  or beef" stores `canonical: "lamb"` plus `alternatives: ["beef"]`, and the recipe needs
  either. It is only `missing` once she has ruled out **every** option — saying "no beef"
  must never hide a recipe that would take the lamb. `lib/ingredients.ts` `splitAlternatives()`
  does the splitting; `Recipe.ingredientChoices` (uuids grouped by line) is what
  `matchPantry` reads, with `ingredientIndex` staying flat for Dexie and `seenCount`.
  - `minced` and `ground` are the same thing said either side of the Atlantic. Both are
    preparation words, so both normalize away and the choice that survives is the one that
    matters. A choice of *preparation* is not a choice of *ingredient*.
  - **The splitter does not complete a shared head noun.** "vegetable or chicken stock"
    gives `["vegetable", "chicken stock"]`, not `["vegetable stock", "chicken stock"]` —
    the rule that would fix it turns "butter or olive oil" into "butter oil". A loose
    alternative sits unused; a wrong one puts a recipe she can't cook at the top. The AI
    is asked to write each option out in full because it can see the page.
  - A **staple among the options satisfies the line outright** — "butter or margarine" is
    never a question when butter is a staple.
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
- **Clearing a file input empties its `FileList`.** `event.target.value = ''` before
  reading `files.length` always saw zero — copy the list out with `Array.from` FIRST. A
  single-file handler that grabs `files[0]` before clearing survives; a multi-file one does
  not, which is why this only showed up on the parse screen.
- The Anthropic SDK is lazily imported so it lands in its own chunk (~156 KB) and only
  downloads when she actually parses a photo.
- `erasableSyntaxOnly` is on, so TypeScript constructor parameter properties
  (`constructor(readonly kind: X)`) do not compile. Declare the fields.
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
