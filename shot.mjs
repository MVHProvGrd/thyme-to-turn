// Screenshot verification. Drives the real app in a real browser at phone size, typing a
// recipe in the way she would, so the pictures are of the app working — not of a mock.
// Run: node shot.mjs   (needs `npm run preview` on 4173)
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BASE = 'http://127.0.0.1:4173/thyme-to-turn/'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

/**
 * A real PNG, drawn here rather than committed as a fixture: the photo pipeline decodes,
 * downscales and re-encodes, so it needs actual pixels.
 *
 * It is drawn as a PAGE -- a sheet of pale paper on a dark table, carrying a block of
 * ragged lines of print inside its margins -- because that is what the ink detector in
 * lib/ink.ts has to find. A photo of coloured bands would exercise the crop plumbing while
 * telling us nothing about whether "Find the text" actually lands on the text.
 */
function testPng(width = 480, height = 320) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // truecolour RGB
  const raw = Buffer.alloc(height * (width * 3 + 1))
  let at = 0
  for (let y = 0; y < height; y += 1) {
    raw[at] = 0 // no per-row filter
    at += 1
    for (let x = 0; x < width; x += 1) {
      // Outside the sheet: the table it is lying on.
      let r = 0x5a
      let g = 0x4a
      let b = 0x3c
      const onPaper = x > width * 0.06 && x < width * 0.94 && y > height * 0.05 && y < height * 0.95
      if (onPaper) {
        // Aged paper.
        r = 0xf4
        g = 0xef
        b = 0xe1
        // A block of print, inset inside the paper's own margins. Lines with leading
        // between them, because a row profile that never dips is not a page.
        const inBlock =
          x > width * 0.2 && x < width * 0.78 && y > height * 0.22 && y < height * 0.74
        const line = Math.floor(((y - height * 0.22) / (height * 0.52)) * 11)
        const withinLine = ((y - height * 0.22) / (height * 0.52)) * 11 - line < 0.55
        // Ragged right edge, so it reads as text rather than a filled rectangle.
        const ragged = x < width * (0.6 + 0.18 * ((line * 7) % 5) / 5)
        if (inBlock && withinLine && ragged) {
          r = 0x2b
          g = 0x26
          b = 0x22
        }
      }
      raw[at] = r
      raw[at + 1] = g
      raw[at + 2] = b
      at += 3
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const RECIPES = [
  {
    title: 'Roast chicken with fennel and bread salad',
    book: 'The Zuni Café Cookbook',
    page: '214',
    lines: [
      ['1', 'whole chicken'],
      ['2 bulbs', 'fennel'],
      ['2 tbsp', 'olive oil'],
      ['½ loaf', 'day-old bread'],
    ],
    method:
      'Salt the bird a day ahead and leave it uncovered in the fridge.\nHeat the oven to 220°C with a cast-iron pan in it.\nRoast breast-side up for 30 minutes, then turn it.\nTear the bread, toss it in the pan juices, and let it sit under the bird.',
  },
  {
    title: 'Lentil soup',
    book: 'Mum, over the phone',
    page: '',
    lines: [
      ['250 g', 'lentils'],
      ['1', 'onion'],
      ['2 cloves', 'garlic'],
      ['1 tsp', 'salt'],
    ],
    method: 'Sweat the onion and garlic.\nAdd the lentils and two litres of water.\nSimmer 40 minutes.',
  },
  {
    title: 'Spaghetti with anchovies and breadcrumbs',
    book: 'River Cafe Cook Book',
    page: '88',
    lines: [
      ['400 g', 'spaghetti'],
      ['6', 'anchovies'],
      ['2 cloves', 'garlic'],
      ['3 tbsp', 'breadcrumbs'],
    ],
    method: 'Fry the crumbs in oil until they colour.\nMelt the anchovies into more oil with the garlic.\nToss everything with the drained pasta.',
  },
  {
    title: 'Fennel gratin with cream and thyme',
    book: 'Simple · Ottolenghi',
    page: '131',
    lines: [
      ['3 bulbs', 'fennel'],
      ['300 ml', 'cream'],
      ['4 sprigs', 'thyme'],
      ['60 g', 'parmesan'],
      ['2', 'shallots'],
      ['1 tbsp', 'olive oil'],
    ],
    method:
      'Halve the fennel and braise it in a little water until a knife slides through.\nLay it in a buttered dish, pour over the cream, scatter the thyme and shallots.\nCover with parmesan and bake at 200°C for 25 minutes until blistered.',
  },
]

// The sandbox has a pinned Chromium; a laptop has Chrome. Never `playwright install`.
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch(
  existsSync(SANDBOX_CHROMIUM) ? { executablePath: SANDBOX_CHROMIUM } : { channel: 'chrome' },
)
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

// The dinner screen is the landing route. With nothing in the box it is the one true
// empty state — a CTA to add a recipe.
await page.goto(BASE)
await page.waitForURL(/#\/dinner/)
await page.waitForSelector('text=Nothing in the box yet')
await page.screenshot({ path: `${OUT}/01-empty-dinner.png` })
await page.goto(`${BASE}#/recipes`)
await page.waitForSelector('text=Nothing in the box yet')
await page.screenshot({ path: `${OUT}/01-empty-list.png` })

for (const recipe of RECIPES) {
  await page.goto(`${BASE}#/edit`)
  await page.getByLabel('Title').fill(recipe.title)
  await page.getByLabel('Book').fill(recipe.book)
  if (recipe.page) await page.getByLabel('Page').fill(recipe.page)

  for (let i = 0; i < recipe.lines.length; i += 1) {
    if (i >= 3) await page.getByRole('button', { name: '+ Add a line' }).click()
    await page.getByLabel(`Quantity, line ${i + 1}`).fill(recipe.lines[i][0])
    await page.getByLabel(`Ingredient, line ${i + 1}`).fill(recipe.lines[i][1])
  }
  await page.getByLabel('Method — one step per line').fill(recipe.method)

  if (recipe === RECIPES[0]) await page.screenshot({ path: `${OUT}/03-edit.png` })
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(/#\/recipe\//)
}

await page.goto(`${BASE}#/recipes`)
await page.waitForSelector('text=Lentil soup')
await page.waitForTimeout(2400) // let the save toast clear so it isn't in every shot
await page.screenshot({ path: `${OUT}/02-list.png` })

await page.getByText('Roast chicken with fennel and bread salad').click()
await page.waitForSelector('text=Method')
await page.screenshot({ path: `${OUT}/04-detail.png` })

await page.getByRole('button', { name: 'Cook mode' }).click()
await page.getByText('Salt the bird a day ahead').click()
await page.screenshot({ path: `${OUT}/05-cook-mode.png` })

await page.goto(`${BASE}#/settings`)
await page.getByRole('button', { name: 'Check storage used' }).click()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/06-settings.png` })

// Prove persistence the way she will: kill the tab, come back, the recipes are still there.
await page.goto('about:blank')
await page.goto(`${BASE}#/recipes`)
await page.waitForSelector('text=Spaghetti with anchovies and breadcrumbs')
await page.screenshot({ path: `${OUT}/07-after-reload.png` })

/* ---------------------------------------------------------------- the dinner screen */

const filter = () => page.getByLabel('Filter ingredients')
// 'Have' must be exact — "Don’t have" contains it as a substring.
const haveTab = () => page.getByRole('tab', { name: 'Have', exact: true })
const outTab = () => page.getByRole('tab', { name: /Don.t have/ })

/** Search for a tile, tap it once. The open tab decides what that one tap means. */
async function tapOnce(name) {
  await filter().fill(name)
  await page.getByRole('button', { name: `${name}, not marked`, exact: true }).click()
  await filter().fill('')
  await page.waitForTimeout(250) // let the re-rank slide finish
}

/** One tap on the Don't have tab: unknown → ruled out. */
async function ruleOut(name) {
  await outTab().click()
  await tapOnce(name)
}

/** One tap on the Have tab: unknown → have. */
async function markHave(name) {
  await haveTab().click()
  await tapOnce(name)
}

// Cold start: nothing marked, every recipe under READY TO COOK, sorted simplest first.
await page.goto(`${BASE}#/dinner`)
await page.waitForSelector('text=Ready to cook')
await page.screenshot({ path: `${OUT}/08-dinner-cold.png` })

// Three things she is out of. garlic → soup and spaghetti drop; cream → the gratin drops;
// anchovy → spaghetti is now two away and only counted.
await ruleOut('garlic')
await ruleOut('cream')
await ruleOut('anchovy')
await page.waitForSelector('text=One thing away')
await page.screenshot({ path: `${OUT}/09-dinner-three-out.png` })

// The card and its missing chips. `not sure` is deliberately not printed (Alisa, Aug 2026).
const gratin = page.locator('article', { hasText: 'Fennel gratin' })
await gratin.scrollIntoViewIfNeeded()
await gratin.screenshot({ path: `${OUT}/10-dinner-card.png` })

// On the recipe itself, the row she is out of says "missing" — same marks, same answer.
await gratin.getByRole('button', { name: /Fennel gratin/ }).click()
await page.waitForSelector('text=Method')
await page.locator('li', { hasText: 'cream' }).getByText('missing').waitFor()
await page.screenshot({ path: `${OUT}/10b-detail-missing.png` })
// Marks survive opening a recipe and coming back — session state, not a saved pantry.
await page.getByRole('button', { name: '← Back' }).click()
await page.waitForURL(/#\/dinner/)
await page.getByRole('button', { name: 'garlic, ruled out' }).waitFor()

// "What if I grab cream on the way home?" — the + flips it to have and everything re-ranks.
await page.getByRole('button', { name: 'add cream to what you have' }).click()
await page.waitForTimeout(300)
// The gratin has lost its missing chip and moved up; cream is now a `have`, so the
// Don't have tab correctly stops offering it. It is on the Have tab instead.
await page.locator('article', { hasText: 'Fennel gratin' }).getByText('missing:').waitFor({ state: 'detached' })
await page.screenshot({ path: `${OUT}/11-dinner-plus.png` })
await haveTab().click()
await page.getByRole('button', { name: 'cream, have', exact: true }).waitFor()
await outTab().click()
await page.waitForTimeout(200)

// ...and on the recipe, that row now carries a ✓ instead.
await page.locator('article', { hasText: 'Fennel gratin' }).getByRole('button', { name: /Fennel gratin/ }).click()
await page.locator('li', { hasText: 'cream' }).getByLabel('have').waitFor()
await page.screenshot({ path: `${OUT}/11b-detail-have.png` })
await page.getByRole('button', { name: '← Back' }).click()
await page.waitForURL(/#\/dinner/)

// Everything ruled out: the card says so and offers Reset. Never a dead end.
await page.getByRole('button', { name: 'Reset' }).first().click()
for (const name of ['garlic', 'fennel', 'chicken', 'lentil', 'anchovy', 'cream']) await ruleOut(name)
await page.waitForSelector('text=Nothing matches')
await page.screenshot({ path: `${OUT}/12-dinner-nothing.png` })

// The Have tab: one tap each, green and ticked. An ingredient marked here is not offered
// as a question on the other tab.
await page.getByRole('button', { name: 'Reset' }).first().click()
await markHave('lentil')
await markHave('onion')
await page.screenshot({ path: `${OUT}/13-dinner-have-tab.png` })
await outTab().click()
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/13b-dinner-out-tab-excludes.png` })
await page.getByRole('button', { name: 'Reset' }).first().click()

// Staples live in Settings; toggling one changes the ranking, so it must be visible.
await page.goto(`${BASE}#/settings`)
// Settings sections stay shut until she opens one — the registry runs to hundreds of rows.
await page.locator('summary', { hasText: 'Staples' }).click()
await page.getByRole('group', { name: 'Your staples' }).waitFor()
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/14-settings-staples.png` })

// The starter set: 100 recipes from Settings, then the dinner screen with something real
// to rank — this is where the question grid earns its keep.
await page.getByRole('button', { name: /Add 100 starter recipes/ }).click()
await page.waitForSelector('text=100 on this phone now', { timeout: 60000 })
await page.waitForTimeout(2400)
await page.screenshot({ path: `${OUT}/15-settings-starter.png` })

await page.goto(`${BASE}#/dinner`)
await page.getByRole('button', { name: 'Reset' }).first().click()
await page.waitForSelector('text=104 recipes')
await page.waitForTimeout(400) // 104 cards sliding into place
await page.screenshot({ path: `${OUT}/16-dinner-104-cold.png` })
await ruleOut('chicken')
await ruleOut('garlic')
await ruleOut('egg')
await ruleOut('tomato')
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/17-dinner-104-four-out.png` })

// A starter recipe cites its source on the card and on the page.
await page.goto(`${BASE}#/recipes`)
await page.getByText('Spaghetti alla Carbonara').click()
await page.waitForSelector('text=Wikibooks Cookbook')
await page.screenshot({ path: `${OUT}/18-starter-detail.png` })

// The ranking fix (Alisa, Aug 2026): marking what she HAS must surface the recipes that
// use it. Before this, "fewest unknowns" meant "simplest recipe" and three marks changed
// nothing visible — a five-line chicken recipe stayed on top.
await page.goto(`${BASE}#/dinner`)
await page.getByRole('button', { name: 'Reset' }).first().click()
for (const name of ['beef', 'onion', 'carrot']) await markHave(name)
await page.waitForTimeout(400)
await page.screenshot({ path: `${OUT}/19-dinner-have-ranking.png` })

/* ------------------------------------------------------------------ categories */

// Settings owns the vocabulary: the presets, plus anything she invents.
await page.goto(`${BASE}#/settings`)
await page.locator('summary', { hasText: 'Categories' }).click()
await page.getByRole('button', { name: 'Remove the Breakfast category' }).waitFor()
await page.getByLabel('New category').fill('Sunday lunch')
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.getByRole('button', { name: 'Remove the Sunday lunch category' }).waitFor()
await page.screenshot({ path: `${OUT}/20-settings-categories.png` })

// She puts a recipe in one while typing it in.
await page.goto(`${BASE}#/recipes`)
await page.getByLabel('Search recipes').fill('Lentil soup')
await page.getByText('Lentil soup', { exact: true }).click()
await page.getByRole('button', { name: 'Edit' }).click()
await page.getByRole('button', { name: 'Soup, not selected' }).click()
await page.getByRole('button', { name: 'Dinner, not selected' }).click()
await page.screenshot({ path: `${OUT}/21-edit-categories.png` })
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForURL(/#\/recipe\//)

// And then finds it by that, alongside the ingredient search.
await page.goto(`${BASE}#/recipes`)
await page.waitForTimeout(2400) // let the save toast clear
await page.getByRole('button', { name: 'Soup, not filtering' }).click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/22-list-category-filter.png` })

/* ----------------------------------------------------------------------- books */

// The shelf, empty.
await page.goto(`${BASE}#/books`)
await page.waitForSelector('text=No books yet')
await page.screenshot({ path: `${OUT}/23-books-empty.png` })

// Typing the ISBN is a first-class path, not a fallback — cameras get denied and iOS has
// no BarcodeDetector at all. This hits Open Library for real.
await page.getByRole('button', { name: 'Scan a book' }).click()
await page.waitForSelector('text=Or type the ISBN')
await page.screenshot({ path: `${OUT}/24-book-scan.png` })
await page.getByLabel('Or type the ISBN').fill('9780393020434')
await page.getByRole('button', { name: 'Look up' }).click()
await page.waitForURL(/#\/book\//, { timeout: 30000 })
await page.waitForSelector('text=Judy Rodgers')
await page.waitForTimeout(2400) // let the toast clear
await page.screenshot({ path: `${OUT}/25-book-detail.png` })

// Re-scanning a book she already has opens it instead of making a second one.
await page.goto(`${BASE}#/books/scan`)
await page.getByLabel('Or type the ISBN').fill('978-0-393-02043-4')
await page.getByRole('button', { name: 'Look up' }).click()
await page.waitForURL(/#\/book\//, { timeout: 30000 })
await page.goto(`${BASE}#/books`)
await page.waitForSelector('text=The Zuni Café Cookbook')
const shelf = await page.getByRole('listitem').count()
if (shelf !== 1) throw new Error(`re-scan duplicated the book: ${shelf} on the shelf`)
await page.screenshot({ path: `${OUT}/26-books-list.png` })

// A book that no catalogue knows is still a book — typed in by hand.
await page.goto(`${BASE}#/books/new`)
await page.getByLabel('Title').fill("Mum's folder")
await page.getByLabel('Authors — separated by commas').fill('Mum')
await page.getByLabel('Where it lives').fill('Kitchen drawer')
await page.screenshot({ path: `${OUT}/27-book-edit.png` })
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForURL(/#\/book\//)

/* --------------------------------------------------------------- dish photos */

// A photo of what she actually made. Downscaled to 2000px before it is ever stored.
await page.goto(`${BASE}#/recipes`)
await page.getByLabel('Search recipes').fill('Lentil soup')
await page.getByText('Lentil soup', { exact: true }).click()
await page.waitForSelector('text=Photos of it')
await page.getByRole('button', { name: 'Add a photo' }).click()
await page.locator('input[type=file]').setInputFiles({
  name: 'dinner.png',
  mimeType: 'image/png',
  buffer: testPng(),
})
await page.getByRole('button', { name: /Crop this photo/ }).waitFor()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/28-recipe-photo.png` })

// Crop is destructive for a DISH photo — hers, so her call. Page photos refuse.
await page.getByRole('button', { name: /Crop this photo/ }).click()
await page.waitForSelector('text=Drag the picture to move it')
await page.locator('input[type=range]').fill('1.8')
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/29-photo-crop.png` })
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForURL(/#\/recipe\//)
await page.waitForTimeout(2400) // let the toast clear

// And the list stops being a wall of text.
await page.goto(`${BASE}#/recipes`)
await page.getByLabel('Search recipes').fill('Lentil')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/30-list-thumbnail.png` })

/* ------------------------------------------------------- photo -> recipe (phase 4) */

// With no key the screen says so and still lets her keep photos. NEVER put a real key here.
await page.goto(`${BASE}#/parse`)
await page.waitForSelector("text=send it to an AI you already have")
await page.screenshot({ path: `${OUT}/31-parse-no-key.png` })

// A page photographed. The parse itself needs her own key, so it is not exercised here.
await page.getByRole('button', { name: 'Take a photo' }).click()
await page.locator('input[type=file]').setInputFiles([
  { name: 'page-214.png', mimeType: 'image/png', buffer: testPng(600, 800) },
  { name: 'page-215.png', mimeType: 'image/png', buffer: testPng(600, 800) },
])
await page.getByRole('button', { name: 'Read the page' }).waitFor()
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/32-parse-pages.png` })

// The box is already drawn: capture runs the ink detector, so she does not draw the same
// rectangle by hand on every page. It is a suggestion — "Whole page" undoes it.
await page.waitForSelector('text=Only the box is sent')
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/32c-parse-autoboxed.png` })

// Undo it, then ask for it back. "Find the text" is the retry when the first guess is
// wrong or she has reset it.
await page.getByRole('button', { name: 'Whole page' }).first().click()
await page.waitForSelector('text=Drag a box around the recipe')
await page.waitForTimeout(150)
await page.screenshot({ path: `${OUT}/32d-parse-wholepage.png` })
await page.getByRole('button', { name: 'Find the text' }).first().click()
await page.waitForSelector('text=Only the box is sent')
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/32e-parse-refound.png` })

// Box it by hand too: the drag still wins over whatever the detector guessed.
const firstPage = page.locator('img[alt="Page 1"]')
const frame = await firstPage.boundingBox()
await page.mouse.move(frame.x + frame.width * 0.15, frame.y + frame.height * 0.2)
await page.mouse.down()
await page.mouse.move(frame.x + frame.width * 0.85, frame.y + frame.height * 0.7, { steps: 12 })
await page.mouse.up()
await page.waitForSelector('text=Only the box is sent')
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/32f-parse-boxed-by-hand.png` })

// The bring-your-own-AI path now has a way to actually hand over the pages.
await page.getByRole('button', { name: /Send .* to my AI/ }).scrollIntoViewIfNeeded()
await page.waitForTimeout(150)
await page.screenshot({ path: `${OUT}/32g-parse-send-to-ai.png` })

// The offline / no-key path: keep the pages, read them when there is signal. An unverified
// recipe carrying page photos IS the queue — no extra table, no lost photographs.
await page.getByRole('button', { name: 'Keep the photos, read them later' }).click()
await page.waitForURL(/#\/recipe\//)
await page.waitForSelector('text=Photographed but not read yet')
await page.waitForTimeout(2400)
await page.screenshot({ path: `${OUT}/32b-parse-kept.png` })

// The Settings key field, with an obviously fake value.
await page.goto(`${BASE}#/settings`)
await page.getByLabel('Claude API key').fill('not-a-real-key-for-screenshots')
await page.waitForSelector('text=Key stored on this device')
await page.screenshot({ path: `${OUT}/33-settings-key.png` })
await page.getByRole('button', { name: 'Remove the key' }).click()
await page.waitForSelector('text=No key yet')

// ★ The verification gate, driven with a stubbed parse rather than a real API call:
// this is the screen that stands between a confident wrong answer and her database.
// Staged from ANOTHER route so /edit mounts with the state already present — which is how
// it arrives in production, and the only way the form's initial values see it.
await page.goto(`${BASE}#/recipes`)
await page.waitForTimeout(2500) // let the "Key removed." toast clear
await page.evaluate((parsed) => {
  window.history.pushState({ usr: { parsed }, key: 'stub', idx: 1 }, '', '#/edit')
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
}, {
  notARecipe: false,
  title: 'Fennel gratin',
  yield: 'Serves 4',
  times: null,
  lowConfidenceFields: ['ingredients.1'],
  ingredients: [
    {
      heading: null,
      items: [
        { raw: '3 bulbs fennel', quantity: 3, unit: 'bulbs', item: 'fennel', canonical: 'fennel', note: null, optional: false },
        { raw: '300 ml double cream', quantity: 300, unit: 'ml', item: 'double cream', canonical: 'cream', note: null, optional: false },
        { raw: 'thyme, to serve', quantity: null, unit: null, item: 'thyme', canonical: 'thyme', note: null, optional: true },
      ],
    },
  ],
  steps: ['Braise the fennel until a knife slides through.', 'Pour over the cream and bake.'],
})
await page.waitForTimeout(400)
const gated = await page.getByText('Nothing is saved yet').count()
if (gated > 0) {
  await page.screenshot({ path: `${OUT}/34-verification-gate.png` })
} else {
  console.log('note: could not stage the parse state in-browser; gate covered by unit tests')
}

/* ------------------------------------------- bring your own AI (no key needed) */

// The path that needs no API key at all: she pastes a reply from whatever assistant she
// already uses. Deliberately messy input — code fences and chatter around the JSON — so
// this proves the forgiving reader, and it exercises the verification gate for real.
await page.goto(`${BASE}#/parse`)
await page.waitForSelector('text=Or use any AI you already have')
await page.screenshot({ path: `${OUT}/35-parse-any-ai.png` })

const REPLY = [
  'Sure — here is the recipe from your photo:',
  '```json',
  JSON.stringify(
    {
      title: 'Braised fennel with cream',
      yield: 'Serves 4',
      ingredients: [
        {
          heading: 'For the gratin',
          items: ['3 bulbs fennel, halved', '300 ml double cream', '60 g parmesan, grated'],
        },
        { heading: 'To serve', items: [{ raw: 'thyme', optional: true }] },
      ],
      method: '1. Braise the fennel until a knife slides through.\n2. Pour over the cream and bake.',
      lowConfidenceFields: ['ingredients.1'],
    },
    null,
    2,
  ),
  '```',
  'Let me know if you want it scaled up!',
].join('\n')

await page.getByLabel('Paste the reply').fill(REPLY)
await page.getByRole('button', { name: 'Check what it read' }).click()
await page.waitForSelector('text=Nothing is saved yet')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/36-any-ai-gate.png` })

// It is still only a suggestion until she says so — Save is what writes it.
// The headings are editable rows, not something that quietly collapses on save.
await page.getByLabel('Group heading 1').waitFor()
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForURL(/#\/recipe\//)
await page.waitForSelector('text=For the gratin')
await page.waitForSelector('text=To serve')
await page.waitForTimeout(2400)
await page.screenshot({ path: `${OUT}/37-any-ai-saved.png` })

/* ---------------------------------------------------- scaling and units */

// Doubling is a DISPLAY choice: `raw` and the stored quantity never move, so it cannot
// corrupt what the page actually said.
await page.getByRole('button', { name: '×2' }).click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/38-recipe-doubled.png` })

// Metric is the same idea: volume to volume, weight to weight, never across the two.
await page.goto(`${BASE}#/settings`)
await page.locator('summary', { hasText: 'Amounts' }).click()
await page.getByText('metric', { exact: true }).click()
await page.waitForTimeout(200)
await page.screenshot({ path: `${OUT}/39-settings-units.png` })

await page.goto(`${BASE}#/recipes`)
await page.getByLabel('Search recipes').fill('Braised fennel')
await page.getByText('Braised fennel with cream', { exact: true }).click()
await page.waitForSelector('text=Make')
await page.waitForTimeout(300)
await page.screenshot({ path: `${OUT}/40-recipe-metric-doubled.png` })

// Repairing the match keys on recipes already saved, and the honest cost/account note
// next to the key field. Selectors are role-based: the section heading and the button
// share the words 'ingredient matching'.
await page.goto(`${BASE}#/settings`)
await page.getByRole('heading', { name: 'Ingredient matching' }).scrollIntoViewIfNeeded()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/41-settings-matching.png` })
await page.getByRole('button', { name: 'Re-check ingredient matching' }).click()
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/41b-settings-matching-done.png` })
// Folding duplicate spellings together. With the starter set loaded the registry is
// genuinely noisy -- "stock" alone matches about a dozen entries -- which is the point.
await page.locator('summary', { hasText: 'Duplicate ingredients' }).click()
await page.waitForTimeout(300)
await page.getByLabel('Search ingredients to merge').fill('stock')
await page.waitForTimeout(400)
await page.getByLabel('Search ingredients to merge').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${OUT}/43-merge-list.png` })
await page
  .getByRole('group', { name: 'Ingredients you can merge' })
  .getByRole('button')
  .nth(1)
  .click()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/44-merge-picked.png` })

await page.getByRole('heading', { name: 'Claude API key' }).scrollIntoViewIfNeeded()
await page.waitForTimeout(250)
await page.screenshot({ path: `${OUT}/42-settings-key.png` })

console.log('shots written')
await browser.close()
