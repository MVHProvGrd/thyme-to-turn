# Starter recipes

`starter.json` — 100 everyday recipes so the dinner screen has something to rank before
Alisa's own books are in. Loaded on demand from Settings → "Add starter recipes"; removable
from the same place. Nothing here is hers: each recipe lands `verified: false` and carries
its source and licence, and the source line on every card says "Wikibooks Cookbook".

## Source and licence

Every recipe is from the [Wikibooks Cookbook](https://en.wikibooks.org/wiki/Cookbook:Table_of_Contents),
licensed **[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)**. Each entry
stores the page URL in `source.url`, `"Wikibooks Cookbook"` in `source.citation`, and
`"CC BY-SA 4.0"` in `source.license`. This file is a derivative of that content and is
shared under the same licence.

Why Wikibooks and not the public-domain cookbooks the planning docs prefer
(`05-SOURCES-AND-RIGHTS.md`): a Tuesday-night screen wants Tuesday-night recipes.
Gutenberg is 1890s prose that needs the paid text-parse to structure and then dominates
"what can I make?" with calf's-foot jelly. Wikibooks pages already have `Ingredients` /
`Procedure` sections, cost nothing to read, and are the kind of thing a person cooks. The
Gutenberg import stays on the roadmap.

## What the script does — and refuses to do

`node scripts/fetch-starter.mjs` (network; ~2 min; safe to rerun) fetches a hand-picked
title list through the MediaWiki API with a contact `User-Agent`, strips wiki markup, and
writes each recipe's ingredient lines **as printed** into `raw`. Nothing is modernised or
rewritten; the app's own parser derives quantity / unit / item / canonical from `raw`
exactly as it does for a typed-in line, and the ingredient registry reconciles names at
load time.

Pages that don't parse cleanly (overview pages, no procedure, one 39-line bánh mì) are
skipped and reported — never half-imported. Groups the page itself calls optional
("Suggested toppings", "Condiments", "Garnish") are flagged `optional: true` so a
suggested pickle never counts as a missing ingredient.

UUIDs are minted once (`crypto.randomUUID()`) and kept across reruns by re-reading this
file, keyed by URL. That stability is what makes "Add starter recipes" idempotent.

## Editing the set

Change `TITLES` in the script and rerun. `STARTER_COUNT` in `index.ts` must match; the
test in `__tests__/starter.test.ts` fails if it drifts.
