# Design

Two documents and two prototypes. Read them in this order.

| File | What it is |
|---|---|
| `designspec.md` | **The brief.** Intent, voice, palette, and §8 "deliberately not designing". The source of truth when the prototypes and the spec disagree. |
| `HANDOFF.md` | **The build spec.** Exact tokens, sizes, states and the ranking rules, screen by screen. This is what the code is measured against. |
| `Thyme to Turn.dc.html` | Clickable prototype — all five screens, the tab bar, live ranking. Open it in a browser. |
| `Dinner Screen.dc.html` | The dinner screen alone, first pass. Kept for reference. |
| `support.js` | The prototype's own template runtime. Ignore it — it is not part of the app. |

**The prototypes are references, not code to copy.** They are rebuilt in React against the
repo's own components; nothing in `src/` imports from this directory.

## Where the build knowingly differs

Deviations are listed here rather than argued in a commit message. Each one is a phase
boundary, not a disagreement with the design.

| Handoff says | Build does | Why |
|---|---|---|
| Rank, never filter — all recipes always listed | `have` marks filter the list to recipes that use them; `dontHave` still only ranks | **Alisa, 2026-08-16, asked twice.** Ranking beef recipes to the top while still listing all 104 under READY TO COOK read as "the app ignored me". The directions aren't symmetric: eliminating can empty a screen, confirming cannot. Self-limiting, so marking something no recipe uses shows everything rather than nothing, and the tally explains the drop. |
| Tile tap cycles `unknown → dontHave → have → unknown` (§2) | Two tabs — `Don't have` / `Have` — and one tap per tile | **Alisa, 2026-08-16.** Up to three taps to say one thing, and no way to see which direction a tap would go without reading the chip. The tabs make the direction explicit and every mark one tap. Same three states, same single match function. A tile marked in one tab is not offered in the other; a search shows everything in its real colour. |
| Sort within a group by fewest `notSure`, then fewest ingredient lines | fewest `missing` → most `confirmed` → fewest `notSure` → title | **Alisa, 2026-08-16.** "Fewest unknowns" is "simplest recipe", so marking beef/onion/carrot as *have* left chicken recipes on top and the marks appeared to do nothing. Confirmed-first makes a `have` mark mean "show me what uses this". Inert at cold start, so simplest-first still holds there. |
| Result card carries `missing: cream` **and** `not sure: shallots, thyme` | `missing:` chips only | **Alisa, after using it (2026-08-16).** At the fridge she reads what she's out of; the soft list was noise. `notSure` still ranks the results, so the order is identical — only the label is gone. This is the gate working as designed: the handoff's instinct was sound, the real kitchen disagreed. |
| (the build added an "only what I listed" checkbox) | Removed | Same session, same reason — she didn't want it. Removed from the screen *and* from `matchPantry`, so there is no untriggerable code path quietly changing match semantics. |
| The ground is plain cream | Plain cream with the logo's thyme sprig scattered on it at 5% | **Mike, 2026-08-16.** Asked for, previewed as a scattered tile against a single large corner sprig, and picked. The corner version looked best exactly where there was least content — on the dinner screen the opaque result cards covered nearly all of it. Contrast measured over the darkest part of the pattern: `ink` 12.5:1, `ink-soft` 6.2:1. Off entirely under `prefers-contrast: more`. |
| Settings has an API key field | It doesn't, yet | Phase 4 brings the photo-parse that spends the key. A stored secret with nothing to spend it on is a liability. |
| Tile grid shows 26 ingredient tiles | Answered tiles, then the 12 most useful questions; the text field searches the whole registry | The prototype has 26 ingredients. She will have hundreds. The grid asks the question that halves the field (`nextQuestions`), and typing finds anything else. |
| Sort within a group by fewest `notSure`, then fewest ingredient lines | …then by coverage (confirmed / required), then title | Coverage rewards what she has actually confirmed; the title tiebreak makes the order stable and explainable. Same first two keys. |
| `marks` is session state | sessionStorage, keyed by registry uuid | Survives opening a recipe and a mid-cooking reload, dies with the tab. Still never a saved pantry. |
| Empty filter result: "No ingredient by that name." | Same; and staples are never in the grid | A tap on a staple would do nothing (staples are subtracted before matching), which is worse than not offering it. Staples change in Settings. |
| Each group renders at most 6 cards | All cards | Tens of recipes, not thousands. Pagination is on the roadmap for when it matters. |
| Export is "a plain JSON dump" | A JSON file with a `manifest` envelope | Same single file she can email herself, but versioned — the importer can refuse a backup from a newer app instead of half-reading it. Phase 4 wraps the same object in a zip once photos exist. |
| Recipe edit has title / book / page / lines / method | Plus a "Your notes" field | `notes` is hers and structurally separate from the transcribed text. It's the one field the parser must never write to, so it exists from the first version. |
