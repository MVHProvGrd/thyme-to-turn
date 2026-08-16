// Screenshot verification. Drives the real app in a real browser at phone size, typing a
// recipe in the way she would, so the pictures are of the app working — not of a mock.
// Run: node shot.mjs   (needs `npm run preview` on 4173)
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://127.0.0.1:4173/thyme-to-turn/'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

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

/** Find a tile by name (typing narrows the grid to it), tap it once: unknown → ruled out. */
async function ruleOut(name) {
  await filter().fill(name)
  await page.getByRole('button', { name: `${name}, not marked` }).click()
  await filter().fill('')
  await page.waitForTimeout(250) // let the re-rank slide finish
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

// The card that carries both labels: missing (hard) and not sure (soft).
const gratin = page.locator('article', { hasText: 'Fennel gratin' })
await gratin.scrollIntoViewIfNeeded()
await gratin.screenshot({ path: `${OUT}/10-dinner-card.png` })

// Marks survive opening a recipe and coming back — session state, not a saved pantry.
await gratin.getByRole('button', { name: /Fennel gratin/ }).click()
await page.waitForSelector('text=Method')
await page.getByRole('button', { name: '← Back' }).click()
await page.waitForURL(/#\/dinner/)
await page.getByRole('button', { name: 'garlic, ruled out' }).waitFor()

// "What if I grab cream on the way home?" — the + flips it to have and everything re-ranks.
await page.getByRole('button', { name: 'add cream to what you have' }).click()
await page.waitForTimeout(250)
await page.getByRole('button', { name: 'cream, have' }).waitFor()
await page.screenshot({ path: `${OUT}/11-dinner-plus.png` })

// Everything ruled out: the card says so and offers Reset. Never a dead end.
await page.getByRole('button', { name: 'Reset' }).first().click()
for (const name of ['garlic', 'fennel', 'chicken', 'lentil', 'anchovy', 'cream']) await ruleOut(name)
await page.waitForSelector('text=Nothing matches')
await page.screenshot({ path: `${OUT}/12-dinner-nothing.png` })

// Only what I listed: the strict extreme, on its own with nothing marked.
await page.getByRole('button', { name: 'Reset' }).first().click()
await page.getByLabel('only what I listed').check()
await page.waitForSelector('text=Tap what you have')
await page.screenshot({ path: `${OUT}/13-dinner-only-listed.png` })
// Two taps to say "have" (dontHave comes first), and the soup is one thing away.
await filter().fill('lentil')
await page.getByRole('button', { name: 'lentil, not marked' }).click()
await page.getByRole('button', { name: 'lentil, ruled out' }).click()
await filter().fill('onion')
await page.getByRole('button', { name: 'onion, not marked' }).click()
await page.getByRole('button', { name: 'onion, ruled out' }).click()
await filter().fill('')
await page.waitForSelector('text=One thing away')
await page.screenshot({ path: `${OUT}/13-dinner-only-listed-two-have.png` })
await page.getByLabel('only what I listed').uncheck()

// Staples live in Settings; toggling one changes the ranking, so it must be visible.
await page.goto(`${BASE}#/settings`)
await page.getByRole('button', { name: 'salt, a staple' }).waitFor()
await page.screenshot({ path: `${OUT}/14-settings-staples.png` })

console.log('shots written')
await browser.close()
