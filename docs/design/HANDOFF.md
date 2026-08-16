# Handoff: Thyme to Turn — dinner screen + phase 1–2 app

## Overview
Thyme to Turn is a personal cookbook index. The user marks what she is out of and the app tells
her what she can still cook tonight, citing the physical book and page each recipe came from.
This handoff covers the dinner screen (the product's core), plus the recipe list, recipe detail /
cook mode, recipe edit, and settings screens, and a bottom tab bar tying them together.

Context that decides most design questions: **she is standing in a kitchen, holding a phone in
one hand, possibly with wet hands, reading at arm's length.**

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing intended
look and behaviour, not production code to copy. The task is to **recreate these designs in the
target codebase's existing environment** (React, SwiftUI, Kotlin/Compose, etc.) using its
established patterns, component library and routing. If no environment exists yet, choose the
framework that fits the project (this is a phone-first, offline-first personal app; a local-first
SPA or a native app both fit) and implement there.

The prototype uses a small in-house template runtime. Ignore it. What matters is the markup
structure, the exact tokens, the state machine and the ranking logic described below.

## Fidelity
**High-fidelity.** Colours, type stacks, spacing, states and copy are final. Recreate pixel-close
using the codebase's own primitives. The only intentionally loose part is the seeded recipe data
(12 sample recipes) — real data replaces it.

## Screens / Views

Device frame in the prototype: 390 × 844 (iPhone-class). Background outside the frame is
`#EDE9DC` (presentation only). The app surface is `paper` `#F6F3E9`.

Global chrome:
- **Bottom tab bar** — full-width flex, three equal tabs (Dinner · Recipes · Settings), 1px top
  border `#DED8C6`, background `paper`, each tab min-height 56px, mono 11px / 0.1em tracking /
  uppercase. Active tab: `#2F5320`, weight 600, `inset 0 2px 0 #7FB03F` top marker. Inactive:
  `#4C5940`, weight 400. Detail and Edit keep the Recipes tab lit.
- **Toast** — absolutely positioned, left/right 20px, bottom 96px (above the tab bar), background
  `#1F2A16`, text `#F6F3E9`, radius 2px, padding 14px 16px, mono 12px. Auto-dismiss after 2.2s.

---

### 1. Dinner screen — "What can I make?" (the one that matters)

**Purpose:** rule out what she is out of and get a ranked answer immediately.

**Layout, top to bottom:**
1. **Header** (padding 22px 20px 14px, bottom border 1px `#DED8C6`)
   - H1 "What can I make?" — serif 27px / 1.1, weight 600, `#2F5320`, letter-spacing -0.01em.
   - **Reset** button right-aligned — mono 11px uppercase 0.08em, `#4C5940`, transparent fill,
     1px `#DED8C6` border, radius 999px, padding 9px 13px, min-height 44px.
   - Tally line — mono 12px `#4C5940`: `"12 recipes · 7 ready · 2 ruled out"`. Live.
2. **Ingredient filter field** (padding 16px 20px 4px) — full width, mono 14px, `#FCFAF3` fill,
   1px `#DED8C6`, radius 2px, padding 13px 14px, min-height 44px, placeholder `type an ingredient…`.
   Filters the tile grid only; it never searches recipes.
3. **Tile grid** — `role="group"`, aria-label "Ingredients", flex wrap, gap 8px, padding
   14px 20px 18px, bottom border 1px `#DED8C6`. 26 ingredient tiles. Empty filter result shows
   mono 12px `#4C5940` "No ingredient by that name."
4. **Results** (padding 6px 20px 24px, gap 22px between groups) — see Result card below.

**Scroll:** header fixed, everything below it scrolls in one region.

---

### 2. The tri-state tile — the core component

Inline-flex, gap 6px, min-height 44px, padding 0 14px, radius 999px, mono 13px, max-width 100%,
`white-space: nowrap`, `overflow: hidden`, `text-overflow: ellipsis`. Labels truncate at 14
characters (13 + ellipsis) — chips are the ONLY place text truncates in the app.

| State | Fill | Border | Text | Mark |
|---|---|---|---|---|
| `unknown` (default) | `#FCFAF3` | 1px `#DED8C6` | `#1F2A16`, weight 400 | none |
| `have` | `rgba(127,176,63,0.16)` | none | `#2F5320`, weight 600 | leading `✓ ` |
| `dontHave` | `rgba(158,86,50,0.12)` | none | `#9E5632` | `line-through`, 1.5px thickness |
| `focus` | as base | as base | as base | 2px `#2F5320` outline, 3px offset |
| `disabled` | `#FCFAF3` at 50% opacity | 1px `#DED8C6` | `#4C5940` at 50% | none, no pointer events |

**Tap cycles `unknown → dontHave → have → unknown`.** `dontHave` first: ruling things out is the
primary gesture.

Emoji leads the label only where one is unambiguous — 🍗 chicken, 🧅 onion, 🧄 garlic, 🍋 lemon,
🥚 eggs, 🍅 tomatoes, 🥓 bacon, 🍚 rice, 🌿 thyme, 🥔 potatoes, 🌶 chilli, 🍄 mushrooms, 🍞 bread,
🥕 carrots. Everything else is a plain mono label. **Never generate ingredient illustrations.**

Accessible name: `"parmesan, ruled out"` / `"onion, have"` / `"garlic, not marked"`.
State is never colour alone — ✓ for have, strikethrough for dontHave.

---

### 3. Result card + group headers

**Group header:** flex, baseline, space-between, padding 14px 0 10px. Label mono 11px, 0.14em
tracking, uppercase, weight 600. Count right-aligned, mono 12px `#4C5940`.
- `READY TO COOK` — label `#4C5940`, no rule.
- `ONE THING AWAY` — label `#2F5320`, and the whole section gets `border-left: 2px solid #7FB03F`,
  `padding-left: 14px`, `margin-left: -16px`. This is the row that earns the feature; it gets more
  presence without shouting.
- Recipes with 2+ missing are not listed — they only feed the "ruled out" count in the tally.

**Result card:** `#FCFAF3` on `#F6F3E9`, 1px `#DED8C6`, radius 2px. Two zones:
- Tappable title zone (padding 14px 15px 4px) → opens recipe detail.
  - Title: serif 19px / 1.25, weight 600, `#1F2A16`, `text-wrap: pretty`, wraps freely (titles run
    to nine words — never truncate).
  - Source: mono 11px / 1.5, `#4C5940`, e.g. `The Zuni Café Cookbook · Judy Rodgers · p.214`.
- Status zone (padding 0 15px 12px, gap 4px):
  - `missing:` label mono 12px weight 600 `#9E5632`, then one chip per missing item: inline-flex,
    min-height 44px, padding 0 10px 0 11px, `rgba(158,86,50,0.10)`, radius 999px, mono 12px weight
    600 `#9E5632`, trailing `+` at 15px / 0.75 opacity. **Tapping flips that ingredient to `have`
    and everything re-ranks.** Accessible name: "add cream to what you have".
  - `not sure: shallots, thyme` — mono 11px / 1.5, `#4C5940`, regular weight, one line, wraps.

The two labels must never be conflated: **missing** = she said she is out of it; **not sure** =
she never mentioned it. No synonyms anywhere in the product.

**Empty / edge states**
- Cold start (nothing marked): every recipe sits under READY TO COOK, sorted simplest-first. Not
  an empty state — it is a useful default.
- Everything ruled out: card `#FCFAF3`, 1px `#DED8C6`, padding 28px 20px — serif 19px "Nothing
  matches. Un-tap something, or add a recipe." plus a primary Reset button.
- Fewer than 15 recipes: quiet mono 11px line under the results, "Add more recipes and this gets
  a lot better." Never styled as a warning.
- No recipes at all: the only true empty state → primary CTA to add one.

---

### 4. Recipe list

Header: H1 "Recipes" (serif 27px, `#2F5320`) + "+ Add" pill (mono 11px uppercase, `#2F5320` text,
1px `#2F5320`, radius 999px, min-height 44px) → opens Edit with a blank draft. Below it a search
field, same spec as the ingredient field, placeholder `search recipes and books…`, matching title
and book text.

Rows: full-width buttons, transparent, bottom border 1px `#DED8C6`, padding 16px 0, gap 5px —
serif 19px / 1.25 title over mono 11px / 1.5 `#4C5940` source. No truncation, no thumbnails in
phase 1 (dish photos land in phase 4; reserve a 56×56 radius-2px leading slot).
Empty search: mono 12px `#4C5940` "No recipe by that name."

### 5. Recipe detail / cook mode

Top bar (padding 18px 20px 12px, bottom border): "← Back" (mono 12px `#4C5940`), then
**Cook mode** toggle and **Edit** on the right.
- Cook mode off: transparent, 1px `#2F5320`, text `#2F5320`, radius 999px, min-height 44px.
- Cook mode on: fill `#2F5320`, text `#F6F3E9`, label reads "Cook mode on".

Body (padding 20px 20px 32px, gap 22px):
- Title serif 26px / 1.15 weight 600 (**30px in cook mode**).
- SourceLine: mono 11px / 1.6, `#2F5320`, underlined with 3px offset, tappable (phase 3: opens
  the book).
- Ingredients card (`#FCFAF3`, 1px `#DED8C6`, radius 2px, padding 16px 16px 14px): mono uppercase
  11px 0.14em header, then rows on a `88px 1fr auto` grid, gap 10px, row gap 9px — quantity mono
  13px `#4C5940`, item mono 13px `#1F2A16`, trailing marker `✓` in `#7FB03F` when she has it or
  `missing` in `#9E5632` when ruled out. Both step to 15px in cook mode. The 88px quantity column
  is what makes `1½ cups` and `350°F / 180°C` line up.
- Method: mono uppercase header, then step rows on a `34px 1fr` grid, gap 10px, padding 13px 13px
  (**16px 14px in cook mode**), `#FCFAF3` + 1px `#DED8C6`, radius 2px. Number mono 12px `#4C5940`
  zero-padded ("01"). Text serif 16px / 1.45 (**21px in cook mode** — the 20–22px floor for
  arm's-length reading). Tapping a step marks it done: background `rgba(127,176,63,0.10)`,
  transparent border, number `#7FB03F`, text `#4C5940`. Done state is per recipe.

### 6. Recipe edit

Top bar: "← Cancel", centred mono uppercase 11px label ("New recipe" / "Edit recipe"), and a
**Save** button (fill `#2F5320`, text `#F6F3E9`, radius 2px, min-height 44px). Save returns to the
previous screen and fires the toast "Saved."

Fields (gap 18px, each label mono 11px 0.12em uppercase `#4C5940` above its control, all controls
`#FCFAF3` + 1px `#DED8C6` + radius 2px):
- Title — serif 19px, min-height 48px.
- Book / Page on a `1fr 88px` grid, gap 10px, mono 13px, min-height 48px.
- Ingredient lines — repeating `88px 1fr 44px` grid, gap 8px: quantity input, item input, and a
  `−` remove button (transparent, 1px `#DED8C6`, `#9E5632`, 44×44). Below: "+ Add a line",
  1px dashed `#DED8C6`, `#2F5320`, min-height 44px.
- Method — textarea, 7 rows, serif 16px / 1.5, one step per line. Split on newline on save.

This screen later doubles as the photo-parse verification gate: low-confidence lines get a
`copper` left rule and the page photo sits behind a zoom affordance next to the Book field.

### 7. Settings

- Info banner: `#FCFAF3`, 1px `#DED8C6`, `border-left: 2px solid #7FB03F`, radius 2px, padding
  13px 14px, mono 11px / 1.6 `#4C5940` — "Everything works offline. The key is only used to read a
  photographed page." Info and warning only; banners never carry errors.
- API key field (mono 13px, min-height 48px) with a note underneath: `#2F5320` "Key stored on this
  device." once a key longer than 8 characters is present, otherwise `#4C5940` "No key yet.
  Photo-parse stays off until there is one." Rejection copy, per the voice rules: "That API key
  was rejected. Check it in Settings." — never "Oops".
- Staples — the same chip component in `unknown` / `have` states only. A staple is never counted
  as "not sure" in ranking. Defaults on: salt, olive oil, black pepper.
- Library: mono 12px / 1.7 summary line, then **Export as JSON** (primary, fill `#2F5320`,
  min-height 48px) and **Delete everything** (destructive: transparent, 1px `rgba(158,86,50,0.45)`,
  text `#9E5632` — destructive requires a confirm Sheet before it acts).

## Interactions & Behavior

**Ranking (the whole product).** For each recipe, resolve its ingredient lines to canonical
ingredient names, then:
- `missing` = ingredients the user marked `dontHave`.
- `notSure` = ingredients with no mark, excluding anything flagged as a staple.
- `missing.length === 0` → READY TO COOK · `=== 1` → ONE THING AWAY · `>= 2` → ruled out (count only).
- Sort within a group by fewest `notSure`, then by fewest ingredient lines ("simplest first").
- Each group renders at most 6 cards in the prototype; production should paginate or lazy-render.

**There is no search button and no end state.** Results recompute synchronously on every tap.
Tapping a `+` on a missing chip sets that ingredient to `have` and re-ranks.

**Motion.** The re-rank is the only animation in the app: a ~180ms position/opacity transition on
result cards. Under `prefers-reduced-motion: reduce` it must degrade to an instant swap. No other
motion anywhere.

**Navigation.** Tabs switch top-level screens. Result card or list row → detail (remembering which
screen it came from so Back returns there). Detail → Edit → Back returns to Detail; Save returns
to Detail (or to the list when creating). Toasts confirm saves and exports.

**Offline.** Offline is normal, not an error. Only the photo-parse touches the network. No
connectivity banner ever appears for anything else.

**Validation.** Save is allowed with an empty method; a recipe with no title is saved as
"Untitled" rather than blocked. Nothing about entry should feel like a form.

## State Management
```
screen        'dinner' | 'list' | 'detail' | 'edit' | 'settings'
prev          screen to return to from detail/edit
marks         { [ingredient]: 'have' | 'dontHave' }   // absent = unknown
query         ingredient-grid filter string
listQuery     recipe-search string
recipeId      currently open recipe
cook          boolean — cook mode type scale
done          { [recipeId + ':' + stepIndex]: true }  // per-recipe step checkmarks
draft         { title, book, page, method, lines: [[qty, item]] } | null
toast         string, cleared after 2200ms
apiKey        string
staples       { [ingredient]: true }
```
All of it is local and offline-first. `marks` is deliberately session-scoped — it answers "what am
I out of tonight", not a persistent pantry (a saved pantry is explicitly out of scope). `staples`,
`apiKey`, recipes and `done` persist. Recipes are the only thing needing storage of size; export is
a plain JSON dump.

## Design Tokens

**Colour**
| Token | Hex | Role |
|---|---|---|
| paper | `#F6F3E9` | Page ground |
| card | `#FCFAF3` | Raised surfaces |
| ink | `#1F2A16` | Body text |
| ink-soft | `#4C5940` | Secondary text, "not sure" |
| rule | `#DED8C6` | Hairlines, unselected borders |
| thyme | `#2F5320` | Primary: headings, primary fill |
| leaf | `#7FB03F` | Accent: yes / confirmed / progress |
| copper | `#9E5632` | Hazard only: missing, destructive, errors |

Derived fills: `rgba(127,176,63,0.16)` (have chip), `rgba(127,176,63,0.10)` (done step),
`rgba(158,86,50,0.12)` (dontHave chip), `rgba(158,86,50,0.10)` (missing chip).
`leaf` is a fill and mark colour only — never body text (it fails 4.5:1 on paper).
The ground is cream, never white. **No dark mode in v1.**

**Type** — no sans-serif anywhere, no webfont URLs (everything bundled or system).
- Serif: `Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif` — everything read.
- Mono: `ui-monospace, SF Mono, Menlo, Consolas, monospace` — every label, datum, marker,
  ingredient name and quantity.
- Scale: H1 27px/1.1 · title 26px (cook 30px) · card title 19px · body serif 16px (cook 21px) ·
  mono body 13px (cook 15px) · mono caption 11–12px · mono eyebrow 11px / 0.12–0.14em / uppercase.

**Spacing** 4px base; the used steps are 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 22 · 24 · 32.
**Radii** 2px everywhere; 999px for chips and pills.
**Elevation** exactly one: `card` on `paper` with a 1px `rule` border. No shadows.
**Hit targets** 44×44 minimum on every tile, chip, button and the small `+`; 48px on form controls;
56px on tab bar items. Primary action sits in the bottom third.
**Focus** 2px `#2F5320` outline, 3px offset, on everything interactive.

## Accessibility
- Body text ≥ 4.5:1. `ink` and `thyme` on `paper` both clear it; `leaf` never carries text.
- State is never colour alone: ✓ for have, strikethrough for dontHave, the word "missing" in
  ingredient rows.
- Tile grid is a `role="group"` with an accessible name; each tile announces its state.
- Results are a live region so a re-rank is announced as a count, not read in full.
- Respect `prefers-reduced-motion`.

## Assets
None. No icon CDN, no webfont URL, no analytics, no third-party anything — the app holds the
user's own API key, so every asset must be bundled. The only glyphs are the logo (supplied
separately), system emoji on ingredient chips, and text characters (`✓`, `+`, `−`, `←`, `·`).
Dish and page photos are user content, added in phases 3–4; wherever a full page photo appears,
a zoom view must exist.

## Files
- `Thyme to Turn.dc.html` — the full clickable app: all five screens, tab bar, live ranking.
- `Dinner Screen.dc.html` — the dinner screen alone, the first pass, kept for reference.
- `designspec.md` — the original brief these were built from; it is the source of truth for
  intent, voice and scope, including §8 "deliberately not designing".

## Out of scope for v1 — do not build
Dark mode · onboarding · accounts or profiles · sharing or publishing · a saved pantry inventory ·
substitution suggestions · meal planning · shopping lists · ratings · generated ingredient
illustrations. Anything in this list that comes up goes in `ROADMAP.md`.

## How to judge the build
> She opens the app on a Tuesday with the fridge door open, taps four things she hasn't got, and
> finds something she wants to cook — **without reading any label twice.**

If a screen is beautiful and she hesitates over what a chip means, the chip is wrong.
