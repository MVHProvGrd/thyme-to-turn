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
await page.getByRole('button', { name: 'salt, a staple' }).waitFor()
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

console.log('shots written')
await browser.close()
