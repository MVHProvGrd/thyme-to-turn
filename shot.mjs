// Screenshot verification. Drives the real app in a real browser at phone size, typing a
// recipe in the way she would, so the pictures are of the app working — not of a mock.
// Run: node shot.mjs   (needs `npm run preview` on 4173)
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

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
      ['250 g', 'brown lentils'],
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
]

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto(BASE)
await page.waitForSelector('text=Nothing in the box yet')
await page.screenshot({ path: `${OUT}/01-empty.png` })

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

console.log('shots written')
await browser.close()
