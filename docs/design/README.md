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
| Three tabs: Dinner · Recipes · Settings | Two: Recipes · Settings | The dinner screen is phase 2. A tab that leads to "nothing here yet" is worse than a tab bar that grows by one. |
| Settings has an API key field | It doesn't, yet | Phase 4 brings the photo-parse that spends the key. A stored secret with nothing to spend it on is a liability. |
| Settings has staples | Phase 2 | Staples only mean something once something reads them, and that's the ranking. |
| `marks` is session state | Phase 2 | Nothing marks anything yet. |
| Export is "a plain JSON dump" | A JSON file with a `manifest` envelope | Same single file she can email herself, but versioned — the importer can refuse a backup from a newer app instead of half-reading it. Phase 4 wraps the same object in a zip once photos exist. |
| Recipe edit has title / book / page / lines / method | Plus a "Your notes" field | `notes` is hers and structurally separate from the transcribed text. It's the one field the parser must never write to, so it exists from the first version. |
