/**
 * The system prompt and the response schema for reading a photographed page.
 *
 * Two ideas do most of the work here.
 *
 * TRANSCRIBE, DON'T IMPROVE. Every rule that says "don't convert", "don't estimate",
 * "leave it null" exists because a confident, wrong parse is worse than no parse — she
 * finds out at the point of creaming the butter. An empty field is correct; a plausible
 * guess is a bug that looks like a feature.
 *
 * FUNCTIONAL CONTENT ONLY. Ingredient list, method, yield, times — the parts that make
 * the app an index into a book she owns. NOT the headnote, not the author's essay, not
 * the voice around the recipe: that is the most creative and most protected part of the
 * page, it is not needed in a search index, and the photo is right there if she wants to
 * read it (05-SOURCES-AND-RIGHTS.md). This rule is load-bearing, not decoration.
 *
 * WHERE THE MATCH KEYS ACTUALLY COME FROM. `canonical` and `alternatives` are asked for
 * here, and the schema guarantees them — but on the way into the database `db/repo.ts`
 * re-derives both from `raw` (`lib/ingredients.ts`), and the "Re-check matching" button
 * re-derives them again later. `raw` is the single source of truth, deliberately: a stored
 * key that only one of the two paths can produce would drift the first time she pressed
 * that button. What these fields are for is the answer itself — the JSON she hands to
 * whatever assistant she already uses is a document in its own right, and it has to be
 * right there too.
 */

import type { ParsedRecipe } from '../lib/types'

export const RECIPE_SCHEMA_VERSION = 1

export const RECIPE_SYSTEM_PROMPT = `You transcribe recipes from photographs of cookbook pages into structured data.

TRANSCRIBE, DO NOT IMPROVE.
- Keep the page's exact wording for every ingredient line and every step.
- Do not convert units, do not Americanise or Anglicise spelling, do not rewrite for clarity, do not modernise old-fashioned wording.
- Never invent. If the yield is not printed, leave it null. Do not estimate a cooking time that is not on the page. An empty field is correct; a plausible guess is a bug.

WHAT TO CAPTURE, AND WHAT TO LEAVE ALONE.
- Capture: title, ingredients, method steps, yield, times.
- IGNORE the headnote — the author's prose introduction, the story, the wine notes, the serving suggestion essay. It is not needed and must not be transcribed.
- If the page is not a recipe (an index, a chapter opener, a photograph, a technique essay), set notARecipe to true and leave everything else null or empty rather than inventing structure.

READING THE PAGE.
- Cookbook pages are often two-column. Read each column top to bottom before starting the next. Never interleave columns.
- Treat every supplied image as ONE recipe: recipes span a spread, and ingredients are often on the facing page.
- Preserve the page's ingredient groupings. "For the crust" / "For the filling" / "To serve" become separate groups carrying the printed heading. Never flatten them into one list — a cook following a merged list creams the filling's butter into the pastry. If the page has no headings, emit a single group with a null heading.

INGREDIENT LINES.
- "raw" is the line exactly as printed, including quantities, parentheticals and notes.
- quantity / unit / item are a PARSE of raw, never a replacement for it. Leave any of them null when the line does not have one.
- "canonical" is the matchable name: singular, lowercase, no quantity, no preparation words, no brand. "finely chopped flat-leaf parsley" gives "parsley"; "1½ cups (190 g) all-purpose flour, sifted" gives "flour".
  - Keep adjectives that make it a DIFFERENT ingredient: "canned tomato", "smoked paprika", "bell pepper", "sour cream". Drop ones that do not: "all-purpose flour" gives "flour".
  - Cuts of meat lead with the animal — "chicken thigh", "beef shin" — so a pantry entry of "chicken" matches by prefix.
  - null is correct when the line is not a discrete ingredient ("a little water for the pan").
- Set optional true for garnishes and anything "to serve", "to taste" or explicitly optional. They must not make a recipe look impossible to cook.

A LINE THAT OFFERS A CHOICE.
- When a line names things that can stand in for each other — "butter or margarine", "vegetable or chicken stock", "milk/cream" — put the FIRST option in "canonical" and every other one in "alternatives". One line, several answers: the cook needs any ONE of them.
- WRITE EACH ALTERNATIVE OUT IN FULL, even where the page shares a word between them. "vegetable or chicken stock" gives canonical "vegetable stock" with alternatives ["chicken stock"] — never the bare word "vegetable". Only a reader who can see the page can restore a shared head noun; anything working from the line alone has to guess, and a guess here is a recipe someone is told they can cook and cannot.
- A choice of PREPARATION is not a choice of ingredient. "minced or ground lamb or beef" is lamb OR beef — minced and ground are the same thing said differently either side of the Atlantic, and neither belongs in a match key. So: canonical "lamb", alternatives ["beef"]. Likewise "chopped or sliced onions" is just "onion", with no alternatives at all.
- Only for genuine substitutes. "salt and pepper" is two ingredients, not a choice. "2 lemons, or 1 tbsp juice" is one ingredient described twice — canonical "lemon", no alternatives.
- Leave "alternatives" as an empty array on every ordinary line. Most lines are ordinary.

REPORT YOUR OWN DOUBT.
- Put a dotted path into lowConfidenceFields for anything you could not read cleanly: "title", "ingredients.0.quantity", "steps.3". Blur, a curved gutter, a cut-off line, an ambiguous fraction — all belong there.
- Guessing silently is the one unrecoverable mistake. Flagging is free.`

/**
 * The same instructions, for pasting into whatever assistant she already uses.
 *
 * A chat window has no structured-output mode, so the shape has to be asked for in words
 * and the answer read forgivingly at the other end (`lib/pasted-parse.ts`). Everything
 * else is identical, including the rules about transcribing rather than improving and
 * leaving the headnote alone — the path in is different, the discipline is not.
 */
export const BRING_YOUR_OWN_AI_PROMPT = `${RECIPE_SYSTEM_PROMPT}

Reply with ONLY this JSON object. No explanation before it, no summary after it:

{
  "notARecipe": false,
  "title": "the recipe's title, or null",
  "yield": "as printed, e.g. Serves 4, or null",
  "times": { "prepMinutes": null, "cookMinutes": null, "totalMinutes": null },
  "ingredients": [
    {
      "heading": "the printed group heading, or null",
      "items": [
        {
          "raw": "the line exactly as printed",
          "quantity": 1.5,
          "unit": "cup",
          "item": "all-purpose flour",
          "canonical": "flour",
          "alternatives": [],
          "note": "sifted",
          "optional": false
        },
        {
          "raw": "500 g minced or ground lamb or beef",
          "quantity": 500,
          "unit": "g",
          "item": "minced or ground lamb or beef",
          "canonical": "lamb",
          "alternatives": ["beef"],
          "note": null,
          "optional": false
        }
      ]
    }
  ],
  "steps": ["one step per entry, in the page's own words"],
  "lowConfidenceFields": ["dotted paths you could not read cleanly"]
}`

/**
 * Structured Outputs schema (D7). The response is guaranteed to match this, so nothing
 * downstream parses text or retries on malformed JSON.
 *
 * Every property is required and nullable rather than optional — that is what the strict
 * schema mode wants, and it means the shape never varies between responses.
 */
export const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['notARecipe', 'title', 'yield', 'times', 'ingredients', 'steps', 'lowConfidenceFields'],
  properties: {
    notARecipe: {
      type: 'boolean',
      description: 'True when the page is not a recipe. Everything else is then empty.',
    },
    title: { type: ['string', 'null'] },
    yield: { type: ['string', 'null'], description: "As printed, e.g. 'Serves 4-6'." },
    times: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['prepMinutes', 'cookMinutes', 'totalMinutes'],
      properties: {
        prepMinutes: { type: ['integer', 'null'] },
        cookMinutes: { type: ['integer', 'null'] },
        totalMinutes: { type: ['integer', 'null'] },
      },
    },
    ingredients: {
      type: 'array',
      description: 'One entry per printed grouping, in page order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['heading', 'items'],
        properties: {
          heading: { type: ['string', 'null'] },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'raw',
                'quantity',
                'unit',
                'item',
                'canonical',
                'alternatives',
                'note',
                'optional',
              ],
              properties: {
                raw: { type: 'string', description: 'The line exactly as printed.' },
                quantity: { type: ['number', 'null'] },
                unit: { type: ['string', 'null'] },
                item: { type: ['string', 'null'] },
                canonical: { type: ['string', 'null'] },
                alternatives: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Stand-ins for canonical when the line offers a choice: "butter or margarine" gives ["margarine"]. Each written out in full, never a shared word on its own. Empty on an ordinary line.',
                },
                note: { type: ['string', 'null'] },
                optional: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    lowConfidenceFields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Dotted paths that were hard to read, e.g. "ingredients.0.quantity".',
    },
  },
} as const

/** The shape RECIPE_SCHEMA guarantees. Defined in lib/types.ts — change both together. */
export type { ParsedRecipe }
