# Roadmap — not now

Ideas land here, not in the current branch. Newest at top.

The habit is the point: every project in this workbench that stayed shippable kept one of
these, and the one that didn't turned into a six-month project that didn't work yet.

## Came up while loading the starter recipes

- **Quantities by weight, and portion changes.** Owner raised 2026-08-16. Two things
  under one heading: showing/entering quantities by weight (metric conversions — the schema
  has `unitPreference` waiting) and scaling a recipe to a different number of portions
  (fraction-aware ×2 / ×½, already listed below). Needs a design conversation first: what
  the card shows, what cook mode shows, whether "does one onion satisfy 2 onions" is ever
  the match's business (it isn't, per the phase-2 brief).
- The normalizer's comma-first rule loses the ingredient in "skinless, boneless chicken"
  (→ `skinless` → nothing). Fix is small; needs a canonical backfill for existing rows.
- 100 real recipes make the registry noisy — `chicken stock`, `chicken broth`, `homemade
  chicken stock`, `low-sodium chicken broth` are four tiles. Alias merging in Settings
  (below) is the answer, not a taxonomy.
- An "include the starter recipes" chip on the dinner screen once her own collection is
  large enough that the starters drown it (05-SOURCES-AND-RIGHTS.md). Today: Remove in
  Settings.
- A canonical backfill command, so improving the normalizer re-derives `canonical` and
  `ingredientIndex` for rows already on the device.

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
