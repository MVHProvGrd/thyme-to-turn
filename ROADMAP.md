# Roadmap — not now

Ideas land here, not in the current branch. Newest at top.

The habit is the point: every project in this workbench that stayed shippable kept one of
these, and the one that didn't turned into a six-month project that didn't work yet.

## Done since this list was written (2026-08-16)

Struck rather than deleted, because "we said we'd do it and did" is worth as much as the
backlog: non-destructive page boxing, automatic text-boxing on capture, ingredient group
headings in the edit form, portion scaling and unit display, the comma-first normalizer bug
and the canonical backfill that makes fixing it mean anything, and sharing pages to an
outside AI.

## Seen in the real registry (2026-08-16)

Loading the 100 starter recipes mints **559** ingredient entries, and searching "stock"
returns about a dozen. Merging (Settings → Duplicate ingredients) handles the genuine
duplicates, but some of these are normalizer artifacts and merging is the wrong tool for
them:

- `beef stock alternatively`, `chicken stock water`, `chicken stock broth` — the line said
  "or" / "alternatively" and the normalizer kept both halves as one name. It should split on
  " or " and take the first alternative, the way it already splits on commas.
- `lea perrin' worcestershire sauce maggi stock cube` — one line listing several products.
  Probably not worth solving; merging it away is fine.
- `chicken stock cube` vs `chicken stock` — correctly distinct (a cube is not a liquid), and
  the derived-products block list already stops `chicken` matching either. Left alone.

## After phase 4 — the honest gaps

- **The live parse has never been run.** It needs Alisa's own API key, which this project
  must never hold. First real test: her key in Settings, one photo of a page she knows,
  and check what comes back against the printed page.
- Measure parse quality on ten photos from three books, then try `claude-haiku-4-5` on the
  same ten and compare. Measure, then downgrade — never the other way round.
- The dinner tally reads "104 recipes · 104 ready" before she marks anything; `READY TO
  COOK` has the same problem at cold start.

## Came up while adding categories

- The dinner tally reads "104 recipes · 104 ready · 0 ruled out" before she marks anything.
  "104 ready" is true to the engine (nothing ruled out) but reads as a claim she can cook
  104 things. Worth rewording once she has an opinion — the group header `READY TO COOK`
  has the same problem at cold start.
- Categories on the dinner screen (only show me dinners) — deliberately not built yet; the
  dinner screen is about ingredients, and one filter at a time is enough to judge.
- Bulk-categorise from the recipe list, for the 100 starter recipes that have no tags.

## Removed after real use — recoverable

Alisa used the dinner screen and asked for both of these to go (2026-08-16). Written down
because "we tried it and she didn't want it" is worth more than the code was.

- **The `not sure: …` line on the result card.** Gone from the card; `notSure` still
  ranks. If it ever comes back it should probably be on the *recipe page* rather than the
  card — she wants the shortlist clean and the detail available.
- **The "only what I listed" checkbox** (and `matchPantry`'s `onlyWhatIListed` option).
  It collapsed `notSure` into `missing` for a bare-cupboard night. To restore: add the
  option back to `matchPantry` (one branch: `missing: [...missing, ...notSure]`), and note
  that under it every recipe must stay a live candidate for `nextQuestions`, or the grid
  goes dead at cold start. Git history has the working version.

## Came up while loading the starter recipes

- **Quantities by weight, and portion changes.** Owner raised 2026-08-16. Two things
  under one heading: showing/entering quantities by weight (metric conversions — the schema
  has `unitPreference` waiting) and scaling a recipe to a different number of portions
  (fraction-aware ×2 / ×½, already listed below). Needs a design conversation first: what
  the card shows, what cook mode shows, whether "does one onion satisfy 2 onions" is ever
  the match's business (it isn't, per the phase-2 brief).
- 100 real recipes make the registry noisy — `chicken stock`, `chicken broth`, `homemade
  chicken stock`, `low-sodium chicken broth` are four tiles. Alias merging in Settings
  (below) is the answer, not a taxonomy.
- An "include the starter recipes" chip on the dinner screen once her own collection is
  large enough that the starters drown it (05-SOURCES-AND-RIGHTS.md). Today: Remove in
  Settings.

## Came up while building the dinner screen

- "I'm out of butter tonight" — ruling out a staple for one evening without un-stapling it
  in Settings. Today staples never appear on the grid.
- Paginate or lazy-render result groups once a group runs past a few dozen cards.
- Typing in the ingredient field could set `have` directly on Enter (the old plan-doc
  idea); today it only filters the grid, per the handoff.
- Alias editing / merging two registry entries in Settings, so `scallion` and `spring
  onion` stop being two tiles.

## After the phase-2 gate

Nothing here gets built until the dinner screen has been used for a week and earned its
place. See `docs/cookbook-app/00-PROJECT-PLAN.md` in the planning repo.

- Books + barcode scanning (phase 3)
- Photo → recipe with Claude vision (phase 4)
- Photos of her own dishes + cropping (phase 3)

## Phase 5 and beyond — only if she asks

- Tags / collections
- Scaling a recipe ×2 or ×½ (fraction-aware)
- Cook mode polish: wake lock, step timers, checkbox state surviving a lock screen
- Substitution hints ("no crème fraîche? sour cream works")
- Bulk import of public-domain cookbooks from Project Gutenberg (the starter set covers
  cold start for now; Gutenberg is the "hundreds more" lever, at the cost of a text-parse)
- A saved pantry, if the ad-hoc one turns out to be a chore
- Cloud sync · sharing with family · a native wrapper via Capacitor
