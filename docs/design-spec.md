# Thyme to Turn — design spec

A brief for building the component library, written to be worked from directly.

Everything here is derived from the logo, the phase plan, and one fact about the user:
**she is standing in a kitchen holding a phone in one hand.** Where a choice is genuinely
open, that fact decides it.

---

## 1. The product in one screen

She marks what she's out of and finds out what's for dinner. Every recipe cites the book
and page it came from, so the app is an index into a shelf she already owns.

**If only one screen gets designed properly, it's the dinner screen (§5).** Everything else
exists to feed it. A recipe list that's merely fine and a dinner screen that's excellent is
a better outcome than the reverse.

---

## 2. Brand

Taken from the logo — an open cookbook wrapped by a thyme sprig and a turning arrow, with
checkmarks running down the page.

### Palette

| Token | Hex | Role |
|---|---|---|
| `paper` | `#F6F3E9` | Page ground. The cream of the book's page. |
| `card` | `#FCFAF3` | Raised surfaces: recipe cards, sheets, the tile grid. |
| `ink` | `#1F2A16` | Body text. The wordmark green at text weight. |
| `ink-soft` | `#4C5940` | Secondary text, captions, "not sure" labels. |
| `rule` | `#DED8C6` | Hairlines, dividers, unselected tile borders. |
| `thyme` | `#2F5320` | **Primary.** Headings, the wordmark, primary buttons. |
| `leaf` | `#7FB03F` | **Accent.** Confirmed states, checkmarks, the "have" tile, progress. |
| `copper` | `#9E5632` | **Hazard only.** "Missing", destructive confirms, errors. Never decorative. |

Two rules that keep it coherent:

- **`leaf` means yes and `copper` means no.** They are the only two semantic colours, and
  neither is ever used to decorate. If a green chip doesn't mean "I have this", it's the
  wrong green.
- **The ground is cream, not white.** White surfaces (`card`) sit *on* cream and read as
  raised. A full-white background loses the book feel entirely.

**Dark mode is out of scope for v1.** She cooks in a lit kitchen and it doubles the design
surface. Commit to the light palette and paint it explicitly.

### Type

Two roles, no sans-serif anywhere. The logo's wordmark is a warm script; the app doesn't
try to match it, it sits beneath it.

| Role | Stack | Used for |
|---|---|---|
| Serif | `Iowan Old Style, Palatino Linotype, Palatino, Georgia, serif` | Everything read: headings, recipe titles, ingredients, method. |
| Mono | `ui-monospace, SF Mono, Menlo, Consolas, monospace` | Every label, datum and marker: eyebrows, counts, page numbers, ingredient chips, quantities. |

Mono for ingredient names and quantities is deliberate — it makes `1½ cups` and
`350°F / 180°C` line up and stay scannable, and it gives chips a catalogue-card feel that
matches the logo's ruled page.

**Cook mode overrides the type scale**: body text steps up to 20–22px minimum. She is
reading it from two feet away with her hands full.

### Voice

Plain, warm, never cute. The app never says "Oops!" and never apologises. Errors say what
happened and what to do:

> *"That API key was rejected. Check it in Settings."*
> not *"Something went wrong 😕"*

Two words carry real meaning and must be used precisely: **missing** (she said she's out of
it) and **not sure** (she never mentioned it). Never a synonym for either.

---

## 3. Constraints that shape everything

- **One thumb, arm's length, possibly wet hands.** Minimum tap target 44×44px, and the
  primary action on any screen sits in the bottom third.
- **Offline is normal, not an error state.** Only the photo-parse needs the network. Nothing
  else should ever show a connectivity warning.
- **No third-party anything.** No icon CDN, no webfont URL, no analytics — the app holds the
  user's own API key, so every asset is bundled. Icons must be inline SVG or drawn in CSS.
- **Content is hers and often long.** Recipe titles run to nine words; ingredient lines run
  to twelve. Design for wrapping, not truncation, everywhere except chips.
- **Photos are heavy and precious.** Thumbnails are cheap; full page photos are the evidence
  she checks a bad parse against, so a zoom view must exist wherever one is shown.

---

## 4. Screen inventory

In build order. Phases 3–5 are listed so the system is designed once, not retrofitted — but
**only phases 0–2 need designing now.**

| # | Screen | Phase | Job |
|---|---|---|---|
| 1 | Recipe list | 1 | Find a recipe. Later: show dish photos. |
| 2 | Recipe detail / cook mode | 1 | Cook from it, hands full. |
| 3 | Recipe edit | 1 | Type one in. Later doubles as the parse verification gate. |
| 4 | **Dinner screen** | **2** | **What can I make?** The product. |
| 5 | Settings | 1–2 | API key, staples, ingredient list, export. |
| 6 | Book list / detail | 3 | The shelf. |
| 7 | Scan | 3 | Barcode + manual ISBN. |
| 8 | Capture + crop | 4 | Photograph a page or a dish. |

---

## 5. The dinner screen — design this one properly

### Layout, top to bottom

```
┌──────────────────────────────────────┐
│  What can I make?          [ Reset ] │  ← header, mono label + count
│  47 recipes · 3 ready · 5 ruled out  │
├──────────────────────────────────────┤
│  [ type an ingredient…            ]  │  ← optional; the grid is primary
│                                      │
│  ✓ chicken   ✓ onion   ✗ p̶a̶r̶m̶e̶s̶a̶n̶     │  ← tri-state tiles, wrapping
│  ✗ c̶r̶e̶a̶m̶     ✗ l̶e̶m̶o̶n̶    garlic       │
│  eggs        tomatoes  bacon         │
│  anchovy     rice      [ more ]      │
├──────────────────────────────────────┤
│  READY TO COOK                    3  │  ← ranked results, live
│  ▸ Chicken with fennel & cream       │
│  ...                                 │
│  ONE THING AWAY                   8  │
│  ▸ Braised fennel gratin             │
│    missing: parmesan · not sure: thyme
└──────────────────────────────────────┘
```

Results update on every tap. **There is no "search" button and no end state** — she stops
when the answer is good enough.

### The tri-state tile — the core component

Every ingredient is in exactly one of three states. Design all three plus focus and
disabled.

| State | Fill | Border | Text | Mark |
|---|---|---|---|---|
| `unknown` (default) | `card` | 1px `rule` | `ink` | none |
| `have` | `leaf` @ 12% | none | `thyme` | ✓ leading |
| `dontHave` | `copper` @ 12% | none | `copper` | strikethrough |

Tapping cycles `unknown → dontHave → have → unknown`. **`dontHave` comes first** because
ruling things out is the primary gesture — she's answering "what am I out of".

Emoji leads the label where one confidently exists (🧅 onion, 🧄 garlic, 🍋 lemon); a plain
mono label otherwise. **Never a generated illustration** — 400 ingredients is an asset
pipeline, and lentils don't look different from split peas at 24px.

Chips are the one place text may truncate, at ~14 characters with an ellipsis.

### The result card

Two labels that must read as different weights of certainty, because conflating them is the
bug that makes the whole screen untrustworthy:

- **`missing: cream`** — `copper`, medium weight. She told us.
- **`not sure: shallots, thyme`** — `ink-soft`, regular, smaller. She never said.

Each missing item is itself a small tap target with a **+** — "what if I grab cream on the
way home?" flips it to `have` and everything re-ranks.

Group headers are mono, uppercase, with the count right-aligned. **"One thing away" is the
row that earns the feature** — give it slightly more presence than the other two (a `leaf`
left-rule reads well without shouting).

### States to design

| State | What it shows |
|---|---|
| Cold start (nothing marked) | Every recipe under "ready", sorted simplest-first. Not empty — this is a useful default. |
| Few recipes (< 15) | A quiet line under the results: *"Add more recipes and this gets a lot better."* Never an error. |
| Everything ruled out | *"Nothing matches. Un-tap something, or add a recipe."* With a Reset. |
| No recipes at all | The only true empty state → primary CTA to add one. |

---

## 6. Component inventory

Build these; everything else composes from them.

**Foundations** — colour tokens, type scale, spacing (4px base), radii (2px hairline, 999px
chips), one elevation (`card` on `paper` + 1px `rule`).

**Components**
1. `Tile` — the tri-state ingredient chip. 5 states. *The most important component here.*
2. `ResultCard` — title, source line, missing/not-sure labels, optional dish thumbnail.
3. `GroupHeader` — mono uppercase label + count.
4. `Button` — primary (`thyme` fill), secondary (outline), ghost, destructive (`copper`).
5. `Field` — text input, textarea, and the ingredient-line row used in recipe edit.
6. `IngredientLine` — quantity · unit · item, mono, aligned; with a `raw` fallback.
7. `StepList` — numbered, checkable, cook-mode sized.
8. `Sheet` — bottom sheet for crop, confirm, and the merge dialog.
9. `EmptyState` — icon slot, one line, one action.
10. `SourceLine` — *The Zuni Café Cookbook · Judy Rodgers · p.214*, tappable.
11. `Banner` — offline / low-confidence / export-reminder. Info and warning only.
12. `Toast` — save confirmations.

---

## 7. Accessibility

Non-negotiable, and mostly cheap:

- **Contrast ≥ 4.5:1 for body text.** `ink` on `paper` and `thyme` on `paper` both clear it.
  `leaf` on `paper` does **not** — leaf is a fill and a mark colour, never body text.
- **State is never colour alone.** `have` carries a ✓, `dontHave` carries a strikethrough.
  This is what makes the tile grid usable for a red-green colourblind cook.
- **44×44px minimum** on every tile, chip and button, including the small **+**.
- Visible focus ring on everything interactive: 2px `thyme`, 3px offset.
- Respect `prefers-reduced-motion` — the re-rank animation is the only motion in the app,
  and it must degrade to an instant swap.
- Tile groups are a `role="group"` with an accessible name; each tile announces its state
  ("parmesan, ruled out").

---

## 8. Deliberately not designing

Not because they're bad — because they're phase 5 and designing them now creates
expectations the build won't meet:

Dark mode · onboarding flow · account or profile UI · sharing or publishing · a saved
pantry inventory · substitution suggestions · meal planning or calendars · shopping lists ·
recipe ratings · generated ingredient illustrations.

If a design for one of these appears, it goes in `ROADMAP.md`, not in the branch.

---

## 9. How to judge it

One test, and it's not a visual one:

> She opens the app on a Tuesday with the fridge door open, taps four things she hasn't got,
> and finds something she wants to cook — **without reading any label twice.**

If a screen is beautiful and she hesitates over what a chip means, the chip is wrong.
