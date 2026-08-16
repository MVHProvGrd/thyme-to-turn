/**
 * Reading a photographed page. The ONLY file that talks to the Claude API.
 *
 * The SDK is imported lazily: it is a couple of hundred kilobytes and she only needs it
 * the moment she actually parses a photo, not every time the app opens on her home screen.
 *
 * Six things that bite a copy-pasted example, all of them handled here:
 *   - `output_config.format`, not the deprecated top-level `output_format`
 *   - the schema constrains the shape, so nothing here parses text or retries on bad JSON
 *   - the messages array ends on a USER turn; an assistant prefill 400s on current models
 *   - no `temperature` / `top_p` / `top_k` — they are rejected
 *   - images go BEFORE the text block
 *   - `stop_reason` is checked before `content` is read, because a refusal is a 200 with
 *     nothing in it and would otherwise throw somewhere confusing
 *
 * `max_tokens` is 8000 rather than something tight because thinking is on by default and
 * shares the budget — a small cap truncates the JSON mid-object.
 */

import { getApiKey } from './key'
import { RECIPE_SCHEMA, RECIPE_SYSTEM_PROMPT } from './prompts'
import { readPref, writePref } from '../platform/prefs'
import type { ParsedRecipe } from '../lib/types'

export const MAX_TOKENS = 8000

/**
 * Which model reads the page. Two, deliberately, and not more: a cheap one that handles a
 * clean printed page, and an expensive one for when the cheap one comes back wrong.
 *
 * Haiku is the default because a printed cookbook page is the easy case and the difference
 * is roughly six times the price per recipe. It downscales images to 1568px on the long
 * edge, so the pages this app already sends are as detailed as it will ever see.
 *
 * The choice is stored next to the key in local storage rather than in Dexie, so it never
 * rides along in a backup and never needs a schema bump.
 */
export type ParseModelId = 'claude-haiku-4-5' | 'claude-opus-5'

export type ParseModel = {
  id: ParseModelId
  label: string
  /** Per recipe, in money rather than tokens — the only unit that means anything to her. */
  cost: string
  blurb: string
}

export const PARSE_MODELS: ParseModel[] = [
  {
    id: 'claude-haiku-4-5',
    label: 'Quick read',
    cost: 'about 1 to 2 cents a recipe',
    blurb: 'Fast, and cheap enough to photograph a whole shelf. Fine on a clean printed page.',
  },
  {
    id: 'claude-opus-5',
    label: 'Careful read',
    cost: 'about 8 to 9 cents a recipe',
    blurb: 'Slower and dearer. Worth it for handwriting, a faded page, or a spread the quick read got wrong.',
  },
]

export const DEFAULT_PARSE_MODEL: ParseModelId = 'claude-haiku-4-5'

const MODEL_PREF = 'parseModel'

export function getParseModel(): ParseModelId {
  const stored = readPref<string>(MODEL_PREF, DEFAULT_PARSE_MODEL)
  return PARSE_MODELS.some((model) => model.id === stored)
    ? (stored as ParseModelId)
    : DEFAULT_PARSE_MODEL
}

export function setParseModel(id: ParseModelId): void {
  writePref(MODEL_PREF, id)
}

export function parseModelLabel(id: string): string {
  return PARSE_MODELS.find((model) => model.id === id)?.label ?? id
}

/** Every failure she can hit, each with a sentence that says what to do about it. */
export type ParseFailure =
  | 'no-key'
  | 'rejected'
  | 'rate-limited'
  | 'busy'
  | 'offline'
  | 'refused'
  | 'not-a-recipe'
  | 'bad-response'

export class ParseError extends Error {
  kind: ParseFailure
  /** The raw body when the shape was wrong — shown in a details block, never swallowed. */
  detail?: string

  constructor(kind: ParseFailure, message: string, detail?: string) {
    super(message)
    this.kind = kind
    this.detail = detail
  }
}

const MESSAGES: Record<ParseFailure, string> = {
  'no-key': 'Add your Claude API key in Settings to read photos. You can still add recipes by typing.',
  rejected: 'That API key was rejected. Check it in Settings.',
  'rate-limited': 'Too many requests just now — wait a minute and try again.',
  busy: 'Claude is busy. Try again in a moment.',
  offline: "You're offline. The photo is saved — parse it when you have signal.",
  refused: "Couldn't read this one. Try a clearer photo, or type it in.",
  'not-a-recipe': "This doesn't look like a recipe page — retake?",
  'bad-response': "The answer came back in a shape the app didn't understand.",
}

export function parseErrorFor(kind: ParseFailure, detail?: string): ParseError {
  return new ParseError(kind, MESSAGES[kind], detail)
}

export type PageImage = { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }

/**
 * What came back, and which model said it. The model travels with the reading rather than
 * being looked up again at save time, so `recipe.parse.model` records what actually read
 * the page even if she changes the setting while the form is open.
 */
export type PageReading = { parsed: ParsedRecipe; model: ParseModelId }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Photos in, a structured recipe out. Nothing is written to the database here — the
 * result goes to the verification form and only exists once she presses Save.
 */
export async function parseRecipePhotos(
  images: PageImage[],
  model: ParseModelId = getParseModel(),
): Promise<PageReading> {
  const apiKey = getApiKey()
  if (!apiKey) throw parseErrorFor('no-key')
  if (images.length === 0) throw parseErrorFor('bad-response', 'No photos were given to parse.')
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw parseErrorFor('offline')

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({
    apiKey,
    // Required for browser use, and acceptable ONLY because the key is her own and this
    // page loads zero third-party scripts. Never add a CDN script or analytics to this app.
    dangerouslyAllowBrowser: true,
  })

  let lastBusy: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system: RECIPE_SYSTEM_PROMPT,
        output_config: { format: { type: 'json_schema', schema: RECIPE_SCHEMA } },
        messages: [
          {
            role: 'user',
            content: [
              ...images.map((image) => ({
                type: 'image' as const,
                source: { type: 'base64' as const, media_type: image.mediaType, data: image.base64 },
              })),
              { type: 'text' as const, text: 'Transcribe the recipe on these pages.' },
            ],
          },
        ],
      } as Parameters<typeof client.messages.create>[0])

      return { parsed: readResponse(response), model }
    } catch (caught) {
      const status = statusOf(caught)
      if (caught instanceof ParseError) throw caught
      if (status === 401 || status === 403) throw parseErrorFor('rejected')
      if (status === 429) throw parseErrorFor('rate-limited')
      if (status === undefined && isNetworkError(caught)) throw parseErrorFor('offline')
      if (status !== undefined && status >= 500) {
        lastBusy = caught
        await sleep(500 * 2 ** attempt)
        continue
      }
      throw parseErrorFor('bad-response', describe(caught))
    }
  }
  throw parseErrorFor('busy', describe(lastBusy))
}

/** A refusal is HTTP 200 with empty content, so `stop_reason` is checked first. */
function readResponse(response: unknown): ParsedRecipe {
  const message = response as { stop_reason?: string; content?: unknown[] }
  if (message.stop_reason === 'refusal') throw parseErrorFor('refused')

  const block = (message.content ?? []).find(
    (part): part is { type: string; text: string } =>
      typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text',
  )
  if (!block?.text) throw parseErrorFor('bad-response', JSON.stringify(message).slice(0, 2000))

  let parsed: unknown
  try {
    parsed = JSON.parse(block.text)
  } catch {
    throw parseErrorFor('bad-response', block.text.slice(0, 2000))
  }

  const recipe = parsed as ParsedRecipe
  if (recipe?.notARecipe) throw parseErrorFor('not-a-recipe')
  if (!Array.isArray(recipe?.ingredients) || !Array.isArray(recipe?.steps)) {
    throw parseErrorFor('bad-response', block.text.slice(0, 2000))
  }
  return recipe
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : undefined
}

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError || /network|fetch|Failed to fetch/i.test(describe(error))
}

/** Never includes the key: only the message, and only ever shown in a details block. */
function describe(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === 'string' ? error : 'Unknown error'
}
