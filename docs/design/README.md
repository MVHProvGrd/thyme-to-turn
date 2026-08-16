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
| Settings has an API key field | It doesn't, yet | Phase 4 brings the photo-parse that spends the key. A stored secret with nothing to spend it on is a liability. |
| Tile grid shows 26 ingredient tiles | Answered tiles, then the 12 most useful questions; the text field searches the whole registry | The prototype has 26 ingredients. She will have hundreds. The grid asks the question that halves the field (`nextQuestions`), and typing finds anything else. |
| Sort within a group by fewest `notSure`, then fewest ingredient lines | …then by coverage (confirmed / required), then title | Coverage rewards what she has actually confirmed; the title tiebreak makes the order stable and explainable. Same first two keys. |
| `marks` is session state | sessionStorage, keyed by registry uuid | Survives opening a recipe and a mid-cooking reload, dies with the tab. Still never a saved pantry. |
| Ranking layout has no strict switch | An "only what I listed" checkbox under the grid | From the build brief: collapses `notSure` into `missing` for the bare-cupboard night. A checkbox, not a mode. Under it, with nothing marked, the empty card reads "Nothing yet. Tap what you have — or show everything." rather than "Un-tap something", because there is nothing to un-tap. |
| Empty filter result: "No ingredient by that name." | Same; and staples are never in the grid | A tap on a staple would do nothing (staples are subtracted before matching), which is worse than not offering it. Staples change in Settings. |
| Each group renders at most 6 cards | All cards | Tens of recipes, not thousands. Pagination is on the roadmap for when it matters. |
| Export is "a plain JSON dump" | A JSON file with a `manifest` envelope | Same single file she can email herself, but versioned — the importer can refuse a backup from a newer app instead of half-reading it. Phase 4 wraps the same object in a zip once photos exist. |
| Recipe edit has title / book / page / lines / method | Plus a "Your notes" field | `notes` is hers and structurally separate from the transcribed text. It's the one field the parser must never write to, so it exists from the first version. |
