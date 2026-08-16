import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

import {
  addDishPhoto,
  deleteBook,
  deleteRecipe,
  findBookByIsbn,
  getBook,
  getPhotoBlob,
  getRecipe,
  listBooks,
  recipesForBook,
  removePhoto,
  replacePhotoBytes,
  saveBook,
  saveRecipe,
  setBookCover,
  wipeEverything,
} from '../repo'

const jpeg = (bytes = 8) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })

/**
 * fake-indexeddb under jsdom does not structured-clone a Blob — it comes back as `{}`, so
 * `.size` and `instanceof Blob` cannot be asserted here. Real browsers store them fine.
 * So these tests assert on row PRESENCE (which the fake store does keep) and on
 * `PhotoRef.bytes`, which repo.ts computes from the blob before storing and is therefore
 * a real number either way. Blob fidelity is verified end-to-end by the screenshot pass.
 */

async function zuni() {
  return saveBook({
    title: 'The Zuni Café Cookbook',
    authors: ['Judy Rodgers'],
    publisher: 'W. W. Norton & Company',
    publishedYear: 2002,
    externalRefs: { isbn13: '9780393020434' },
    source: 'openlibrary',
  })
}

describe('books in repo.ts', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  it('finds an existing book by ISBN — the check that stops two Zuni Cafés', async () => {
    const book = await zuni()
    expect((await findBookByIsbn('9780393020434'))?.uuid).toBe(book.uuid)
    // However she typed it: hyphens and an ISBN: prefix normalize to the same key.
    expect((await findBookByIsbn('978-0-393-02043-4'))?.uuid).toBe(book.uuid)
    expect(await findBookByIsbn('9780714847696')).toBeUndefined()
    expect(await listBooks()).toHaveLength(1)
  })

  it('keeps a book uuid across an edit, and never mints a second row', async () => {
    const book = await zuni()
    const fixed = await saveBook({
      uuid: book.uuid,
      title: 'The Zuni Cafe Cookbook',
      authors: ['Judy Rodgers'],
      externalRefs: book.externalRefs,
      source: 'manual',
    })
    expect(fixed.uuid).toBe(book.uuid)
    expect(fixed.createdAt).toBe(book.createdAt)
    expect(await listBooks()).toHaveLength(1)
  })

  it('refreshes the citation on every recipe pointing at it when the book is corrected', async () => {
    const book = await zuni()
    const recipe = await saveRecipe({
      title: 'Roast chicken',
      source: { kind: 'book', bookUuid: book.uuid, pageStart: 214 },
      ingredients: [{ items: [{ raw: '1 chicken' }] }],
      steps: [],
    })
    expect(recipe.source.citation).toBe('The Zuni Café Cookbook · Judy Rodgers')

    await saveBook({
      uuid: book.uuid,
      title: 'The Zuni Café Cookbook',
      authors: ['Judy Rodgers', 'Gerald Asher'],
      externalRefs: book.externalRefs,
      source: 'manual',
    })
    expect((await getRecipe(recipe.uuid))?.source.citation).toBe(
      'The Zuni Café Cookbook · Judy Rodgers, Gerald Asher',
    )
  })

  it('lists a book’s recipes by page', async () => {
    const book = await zuni()
    for (const [title, pageStart] of [['Late', 300], ['Early', 12], ['Middle', 214]] as const) {
      await saveRecipe({
        title,
        source: { kind: 'book', bookUuid: book.uuid, pageStart },
        ingredients: [],
        steps: [],
      })
    }
    expect((await recipesForBook(book.uuid)).map((r) => r.title)).toEqual(['Early', 'Middle', 'Late'])
  })

  it('deleting a book never deletes a recipe — it keeps the citation and drops the link', async () => {
    const book = await zuni()
    const recipe = await saveRecipe({
      title: 'Roast chicken',
      source: { kind: 'book', bookUuid: book.uuid, pageStart: 214 },
      ingredients: [],
      steps: [],
    })
    await deleteBook(book.uuid)

    expect(await getBook(book.uuid)).toBeUndefined()
    const after = await getRecipe(recipe.uuid)
    expect(after?.title).toBe('Roast chicken')
    expect(after?.source.bookUuid).toBeUndefined()
    expect(after?.source.citation).toBe('The Zuni Café Cookbook · Judy Rodgers')
    expect(after?.source.pageStart).toBe(214)
  })

  it('stores a cover blob once and replaces it rather than piling them up', async () => {
    const book = await zuni()
    await setBookCover(book.uuid, jpeg(4), { width: 2, height: 3 })
    const first = (await getBook(book.uuid))!.cover!
    expect(first.bytes).toBe(4)
    expect(await getPhotoBlob(first.uuid)).toBeDefined()

    await setBookCover(book.uuid, jpeg(9))
    const second = (await getBook(book.uuid))!.cover!
    expect(second.uuid).not.toBe(first.uuid)
    expect(second.bytes).toBe(9)
    expect(await getPhotoBlob(first.uuid)).toBeUndefined() // the old one is gone, not orphaned
  })
})

describe('photos in repo.ts', () => {
  beforeEach(async () => {
    await wipeEverything()
  })

  async function recipeWithDish() {
    const recipe = await saveRecipe({ title: 'Soup', source: { kind: 'other' }, ingredients: [], steps: [] })
    const ref = await addDishPhoto(recipe.uuid, jpeg(5), { width: 10, height: 20 })
    return { recipeUuid: recipe.uuid, ref: ref! }
  }

  it('attaches a dish photo; the first one is the thumbnail', async () => {
    const { recipeUuid, ref } = await recipeWithDish()
    await addDishPhoto(recipeUuid, jpeg(6))
    const photos = (await getRecipe(recipeUuid))!.photos
    expect(photos.map((p) => p.kind)).toEqual(['dish', 'dish'])
    expect(photos[0].uuid).toBe(ref.uuid)
    expect(photos[0].width).toBe(10)
  })

  it('crops a dish photo in place — same uuid, new bytes', async () => {
    const { recipeUuid, ref } = await recipeWithDish()
    await replacePhotoBytes(recipeUuid, ref.uuid, jpeg(3), { width: 5, height: 5 })
    const photos = (await getRecipe(recipeUuid))!.photos
    expect(photos[0].uuid).toBe(ref.uuid) // same uuid: nothing referencing it changes
    expect(photos[0].bytes).toBe(3)
    expect(photos[0].width).toBe(5)
  })

  it('refuses to overwrite a PAGE photo — that one is evidence', async () => {
    const recipe = await saveRecipe({ title: 'Tart', source: { kind: 'other' }, ingredients: [], steps: [] })
    const ref = await addDishPhoto(recipe.uuid, jpeg(5))
    // Force it to a page photo, the way phase 4's capture will.
    const { db } = await import('../db')
    const row = (await db.recipes.get(recipe.uuid))!
    await db.recipes.put({ ...row, photos: [{ ...ref!, kind: 'page' }] })

    await expect(replacePhotoBytes(recipe.uuid, ref!.uuid, jpeg(1))).rejects.toThrow(/evidence/)
    expect((await db.recipes.get(recipe.uuid))!.photos[0].bytes).toBe(5) // untouched
  })

  it('removing a photo drops the blob too', async () => {
    const { recipeUuid, ref } = await recipeWithDish()
    await removePhoto(recipeUuid, ref.uuid)
    expect((await getRecipe(recipeUuid))!.photos).toEqual([])
    expect(await getPhotoBlob(ref.uuid)).toBeUndefined()
  })

  it('deleting a recipe takes its photos with it — no orphaned megabytes', async () => {
    const { recipeUuid, ref } = await recipeWithDish()
    await deleteRecipe(recipeUuid)
    expect(await getPhotoBlob(ref.uuid)).toBeUndefined()
  })
})
