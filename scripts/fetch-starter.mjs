// Builds src/seed/starter.json — the starter recipes — from the Wikibooks Cookbook.
//
// Run: node scripts/fetch-starter.mjs      (needs the network; ~2 minutes; rerunnable)
//
// Why Wikibooks: modern, structured recipes (Ingredients / Procedure), free, and licensed
// CC BY-SA 4.0 — attribution is satisfied by the source line on every recipe and the URL
// stored with it. See src/seed/README.md and 05-SOURCES-AND-RIGHTS.md in the planning repo.
//
// What it does NOT do: modernise, rewrite or "fix" a recipe. `raw` is the line as printed
// (minus wiki markup); the app's own parser derives everything else. If a page can't be
// read cleanly it is skipped and reported, never half-imported.
//
// UUIDs: minted with crypto.randomUUID() the first time a page is seen, then kept forever
// by re-reading the existing starter.json (keyed by URL). Regenerating the file must never
// change a recipe's identity — that is what makes "Add starter recipes" an upsert-safe skip.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { parseIngredientLine } from '../src/lib/ingredients.ts'

const API = 'https://en.wikibooks.org/w/api.php'
const UA = 'thyme-to-turn starter-recipes script (https://github.com/MVHProvGrd/thyme-to-turn; mikehatkevich@gmail.com)'
const OUT = 'src/seed/starter.json'
const LICENSE = 'CC BY-SA 4.0'
const CITATION = 'Wikibooks Cookbook'

/**
 * Hand-picked: things a person might actually cook on a Tuesday, from a range of cuisines,
 * leaning on the Featured and Main-course categories. Titles are exact Wikibooks page
 * names (minus the "Cookbook:" prefix). A title that doesn't exist or doesn't parse is
 * reported and skipped — nothing is invented to fill the gap.
 */
const TITLES = [
  // Featured
  'Ají de Gallina (Peruvian Chili Chicken)',
  'Bánh Mì',
  'Chicken Tikka',
  'Chicken Tikka Masala',
  'Focaccia II',
  'Fresh Mozzarella Bruschetta',
  'Ossobuco Alla Milanese',
  'Paella de Marisco',
  'Paella Valenciana',
  'Pattaya Fried Rice',
  'Pork Gyoza',
  'Rice and Lentils (Mejadra)',
  'Risotto (Basic)',
  'Spaghetti alla Carbonara',
  'Spaghetti alla Puttanesca',
  'Spaghetti and Meatballs',
  'Spaghetti with Clams',
  'Tarbes Salad',
  // Main courses
  '20-Minute Beef Stroganoff',
  'Arroz con Pollo (Rice and Chicken)',
  'Asparagus Frittata',
  'Baked Chicken Breasts',
  'Baked Lemon Thyme Halibut',
  'Bangers and Mash',
  'Beef Curry',
  'Beef Fajitas',
  'Beef Stir-Fry',
  'Black Bean Chili',
  'Boeuf Bourguignon',
  'Bulgogi',
  'Cajun Red Beans and Rice',
  'Chicken Cacciatore',
  'Chicken Marsala II',
  'Chicken Curry',
  'Chicken Paprikash',
  'Chicken Parmigiana',
  'Chicken Pot Pie I',
  'Chicken Tagine with Lemon and Olives',
  'Chicken Vindaloo',
  'Chow Mein',
  'Coq au Vin I',
  'Crab Cakes',
  'Cuban Picadillo',
  'Eggplant and Chickpea Skillet',
  'Enchiladas Rojas',
  'Fried Chicken',
  'Frikadeller (Danish Meatballs)',
  'Garlic Shrimp with Lemon Butter Sauce',
  "General Tso's Chicken",
  'Greek Moussaka',
  'Green Chicken Curry with Coconut Milk',
  'Gyudon (Japanese Beef and Rice Bowl)',
  'Honey Garlic Chicken',
  'Jambalaya I',
  'Khao Pad (Thai Fried Rice)',
  'Kung Pao Chicken',
  'Lancashire Hotpot',
  'Lasagne with Red and White Sauce',
  'Lemon Chicken Pasta',
  'Lomo Saltado (Peruvian Steak Stir-fry)',
  'Meatloaf I',
  'Mussels in Onion and Butter Sauce (Moules Mariniere)',
  'Pad Thai',
  'Pan-Seared Pork Chops',
  'Penne with Hearty Meat Sauce',
  'Roast Chicken',
  'Roast Beef',
  'Ropa Vieja (Caribbean Shredded Beef)',
  'Salmon Cakes',
  "Shepherd's Pie I",
  'Shrimp Curry',
  'Spaghetti with Bolognese Meat Sauce',
  'Spinach and Ricotta Lasagna',
  'Steak au Poivre (Pepper Steak)',
  'Stoofvlees (Flemish Beef Stew)',
  'Swedish Meatballs I',
  'Sweet and Sour Chinese Pork',
  'Tacos',
  'Teriyaki Salmon',
  'Thai Green Curry with Chicken',
  'Toad in the Hole',
  'Tonkatsu',
  'Tuna Casserole',
  'Ukrainian Borscht',
  'Vegetarian Soft Tacos',
  'Zuppa Toscana',
  // Soups
  'Tomato Basil Soup with Garlic Toasts',
  'Tuscan Bean Soup',
  'Vegetable Soup',
  'Yellow Split Pea Soup',
  'Tortilla Soup',
  'Tom Yum Gai',
  'White Bean Soup with Basil, Rosemary, and Garlic Croutons',
  // Likely-to-exist staples; missing ones are simply reported
  'Dal',
  'Ratatouille',
  'Minestrone',
  'Chili con Carne',
  'Macaroni and Cheese',
  'Omelette',
  'Shakshouka',
  'Falafel',
  'Chana Masala',
  'Pasta e Fagioli',
  'Pizza Margherita',
  'Caesar Salad',
  'Greek Salad',
  'Tabbouleh',
  'Gazpacho',
  'French Onion Soup',
  'Potato Leek Soup',
  'Chicken Noodle Soup',
  'Beef Stew',
  'Quiche Lorraine',
  'Fish and Chips',
]

/* ------------------------------------------------------------------ fetching */

async function fetchWikitext(title) {
  const url = new URL(API)
  url.search = new URLSearchParams({
    action: 'parse',
    page: `Cookbook:${title}`,
    prop: 'wikitext',
    format: 'json',
    formatversion: '2',
    redirects: '1',
  }).toString()
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.error) throw new Error(json.error.code)
  return { title: json.parse.title.replace(/^Cookbook:/, ''), wikitext: json.parse.wikitext }
}

/* ------------------------------------------------------------------ cleaning */

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&ndash;': '–', '&mdash;': '—', '&deg;': '°', '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾' }

/** Turn one wikitext line into plain text. Conservative: unknown templates are dropped. */
function clean(text) {
  let t = text
  t = t.replace(/<!--[\s\S]*?-->/g, '')
  t = t.replace(/<ref[^>]*\/>/gi, '')
  t = t.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
  // Templates, innermost first, a few passes for nesting.
  for (let i = 0; i < 4; i += 1) {
    t = t.replace(/\{\{([^{}]*)\}\}/g, (_, body) => template(body))
  }
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, (_, label) => label.replace(/^Cookbook:/, ''))
  t = t.replace(/\[https?:[^\s\]]+\s*([^\]]*)\]/g, '$1')
  t = t.replace(/'''''|'''|''/g, '')
  t = t.replace(/<[^>]+>/g, '')
  for (const [ent, ch] of Object.entries(ENTITIES)) t = t.split(ent).join(ch)
  t = t.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  return t.replace(/\s+/g, ' ').trim()
}

function template(body) {
  const parts = body.split('|').map((p) => p.trim())
  const name = parts[0].toLowerCase()
  const params = parts.slice(1).filter((p) => !p.includes('='))
  if (name === 'convert' || name === 'cvt') {
    if (['to', '-', 'and', 'by', '–'].includes(params[1])) return `${params[0]}${params[1] === '-' || params[1] === '–' ? '–' : ` ${params[1]} `}${params[2]} ${params[3] ?? ''}`.trim()
    return `${params[0]} ${params[1] ?? ''}`.trim()
  }
  if (name === 'frac' || name === 'fraction') {
    if (params.length === 1) return `1/${params[0]}`
    if (params.length === 2) return `${params[0]}/${params[1]}`
    if (params.length >= 3) return `${params[0]} ${params[1]}/${params[2]}`
  }
  if (name === 'nowrap' || name === 'sic') return params[0] ?? ''
  return ''
}

/* ------------------------------------------------------------------- parsing */

const H2 = /^==\s*([^=].*?)\s*==\s*$/
const H3 = /^===\s*(.*?)\s*===\s*$/
const INGREDIENTS = /^ingredients?\b/i
const PROCEDURE = /^(procedure|method|directions|instructions|preparation|steps)\b/i

function parseRecipe(title, wikitext) {
  const lines = wikitext.split('\n')
  let section = null
  const groups = []
  let group = { items: [] }
  const steps = []
  let servings

  const summary = wikitext.match(/\{\{recipesummary([\s\S]*?)\}\}/i)
  if (summary) {
    const m = summary[1].match(/\|\s*servings\s*=\s*([^|\n}]+)/i)
    if (m) servings = clean(m[1])
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const h3 = line.match(H3)
    const h2 = !h3 && line.match(H2)
    if (h2) {
      const name = clean(h2[1])
      section = INGREDIENTS.test(name) ? 'ingredients' : PROCEDURE.test(name) ? 'procedure' : null
      continue
    }
    if (h3 || /^;\s*\S/.test(line)) {
      if (section === 'ingredients') {
        if (group.items.length) groups.push(group)
        group = { heading: clean(h3 ? h3[1] : line.slice(1)), items: [] }
      }
      continue
    }
    if (section === 'ingredients' && /^\*+\s*\S/.test(line)) {
      const raw = clean(line.replace(/^\*+/, ''))
      if (raw) group.items.push({ raw })
    } else if (section === 'procedure' && /^[#*]+\s*\S/.test(line)) {
      const text = clean(line.replace(/^[#*]+/, ''))
      if (text) steps.push(text)
    }
  }
  if (group.items.length) groups.push(group)

  // A group the page itself calls optional — "Suggested toppings", "Condiments",
  // "Recommended accompaniments", "Garnish", "Meat (optional)" — is not a requirement.
  // `raw` keeps the line as printed; only the optional flag is set, so the dinner screen
  // never counts a suggested pickle as a missing ingredient.
  const ingredients = groups.map((g) => {
    const items = g.heading && OPTIONAL_GROUP.test(g.heading) ? g.items.map((i) => ({ ...i, optional: true })) : g.items
    return g.heading ? { heading: g.heading, items } : { items }
  })

  return {
    title: cleanTitle(title),
    ingredients,
    steps: steps.map((text, i) => ({ n: i + 1, text })),
    ...(servings ? { yield: { text: yieldText(servings) } } : {}),
  }
}

const OPTIONAL_GROUP = /optional|suggested|topping|garnish|condiment|accompaniment|to serve|serving|dipping/i

/** "4" → "Serves 4"; "12 persons" → "Serves 12"; anything else as written. */
function yieldText(servings) {
  const t = servings.replace(/\s*(persons?|people|servings?)\b/i, '').trim()
  return /^\d/.test(t) ? `Serves ${t}` : servings
}

/** "Guacamole I" → "Guacamole"; keeps parentheticals like "(Mejadra)" — they name the dish. */
function cleanTitle(title) {
  return title.replace(/\s+(I{1,3}|IV|V)$/i, '').trim()
}

/* ---------------------------------------------------------------- validation */

function problems(recipe) {
  const out = []
  const items = recipe.ingredients.flatMap((g) => g.items)
  if (items.length < 3) out.push(`only ${items.length} ingredient lines`)
  if (recipe.steps.length < 2) out.push(`only ${recipe.steps.length} steps`)
  if (items.length > 30) out.push(`${items.length} ingredient lines — too long to be a weeknight`)
  const parsed = items.filter((i) => parseIngredientLine(i.raw).canonical)
  if (items.length && parsed.length / items.length < 0.8) out.push(`only ${parsed.length}/${items.length} lines parse to an ingredient`)
  if (items.some((i) => i.raw.length > 160)) out.push('an ingredient line is a paragraph')
  if (recipe.steps.some((s) => s.text.length > 700)) out.push('a step is an essay')
  // Lines that are prose rather than ingredients: "2 sausages per person", "seasonings as
  // desired", or nothing the parser can name. A recipe that is mostly those is a sketch,
  // not a recipe, and would only ever be "not sure" about everything.
  const required = items.filter((i) => !i.optional)
  const junk = required.filter((i) => {
    const canonical = parseIngredientLine(i.raw).canonical
    return !canonical || canonical.split(' ').length >= 4 || /per|as desired|quantity of/i.test(i.raw)
  })
  if (required.length && junk.length / required.length > 0.4) out.push(`${junk.length}/${required.length} lines are prose, not ingredients`)
  return out
}

/* --------------------------------------------------------------------- main */

const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const uuidByUrl = new Map(existing.map((r) => [r.source.url, r.uuid]))

const kept = []
const skipped = []
for (const title of TITLES) {
  await new Promise((r) => setTimeout(r, 150))
  let page
  try {
    page = await fetchWikitext(title)
  } catch (error) {
    skipped.push(`${title}: ${error.message}`)
    continue
  }
  const recipe = parseRecipe(page.title, page.wikitext)
  const why = problems(recipe)
  if (why.length) {
    skipped.push(`${title}: ${why.join('; ')}`)
    continue
  }
  const url = `https://en.wikibooks.org/wiki/Cookbook:${encodeURIComponent(page.title.replace(/ /g, '_'))}`
  kept.push({
    uuid: uuidByUrl.get(url) ?? randomUUID(),
    title: recipe.title,
    source: { kind: 'web', citation: CITATION, url, license: LICENSE },
    ...(recipe.yield ? { yield: recipe.yield } : {}),
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: [],
  })
  process.stdout.write('.')
}
console.log()

kept.sort((a, b) => a.title.localeCompare(b.title))
mkdirSync('src/seed', { recursive: true })
writeFileSync(OUT, JSON.stringify(kept, null, 2) + '\n')

console.log(`kept ${kept.length} recipes → ${OUT}`)
if (skipped.length) {
  console.log(`skipped ${skipped.length}:`)
  for (const line of skipped) console.log(`  - ${line}`)
}
