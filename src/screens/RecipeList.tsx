import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import Screen, { ScreenHeader } from '../components/Screen'
import { SearchField } from '../components/Field'
import SourceLine from '../components/SourceLine'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import Tile from '../components/Tile'
import { listCategories, listRecipes } from '../db/repo'
import { hasCategory, sameCategory } from '../lib/categories'
import { searchRecipes } from '../lib/search'

/**
 * Find a recipe. Rows wrap rather than truncate — her titles run to nine words, and a
 * title she can't read is a recipe she can't find.
 */
export default function RecipeList() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const recipes = useLiveQuery(listRecipes, [], undefined)
  const categories = useLiveQuery(listCategories, [], undefined)

  /*
   * Only categories something actually uses. Ten empty chips that all return nothing is
   * noise; this way the row appears as she starts labelling and never offers a dead end.
   * A tag she removed from the vocabulary but not from her recipes still shows here.
   */
  const inUse = useMemo(() => {
    const used = new Set<string>()
    for (const recipe of recipes ?? []) for (const tag of recipe.tags) used.add(tag)
    const known = (categories ?? []).filter((name) => [...used].some((tag) => sameCategory(tag, name)))
    const orphans = [...used].filter((tag) => !(categories ?? []).some((name) => sameCategory(name, tag)))
    return [...known, ...orphans]
  }, [recipes, categories])

  const results = useMemo(() => {
    const found = recipes ? searchRecipes(recipes, query) : []
    return category ? found.filter((recipe) => hasCategory(recipe.tags, category)) : found
  }, [recipes, query, category])

  return (
    <Screen
      header={
        <ScreenHeader
          title="Recipes"
          action={
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => navigate('/books')}>
                Books
              </Button>
              <Button variant="secondary" onClick={() => navigate('/edit')}>
                + Add
              </Button>
            </div>
          }
        />
      }
    >
      <div className="px-5 pb-6 pt-4">
        {recipes && recipes.length > 0 ? (
          <SearchField
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search recipes and books…"
            aria-label="Search recipes"
          />
        ) : null}

        {inUse.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-3" role="group" aria-label="Filter by category">
            {inUse.map((name) => {
              const on = category !== null && sameCategory(category, name)
              return (
                <Tile
                  key={name}
                  name={name}
                  state={on ? 'have' : 'unknown'}
                  ariaLabel={`${name}, ${on ? 'filtering' : 'not filtering'}`}
                  onTap={() => setCategory(on ? null : name)}
                />
              )
            })}
          </div>
        ) : null}

        {recipes === undefined ? null : recipes.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              line="Nothing in the box yet. Type in a recipe you already know by heart."
              action={<Button onClick={() => navigate('/edit')}>Add a recipe</Button>}
            />
          </div>
        ) : results.length === 0 ? (
          <p className="pt-6 font-mono text-xs text-ink-soft">
            {category && !query ? `Nothing in ${category} yet.` : 'No recipe by that name.'}
          </p>
        ) : (
          <ul>
            {results.map((recipe) => (
              <li key={recipe.uuid}>
                <button
                  type="button"
                  onClick={() => navigate(`/recipe/${recipe.uuid}`)}
                  className="flex w-full flex-col items-start gap-[5px] border-b border-rule py-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-thyme"
                >
                  <span className="font-serif text-[19px] font-semibold leading-[1.25] text-ink">
                    {recipe.title}
                  </span>
                  <SourceLine citation={recipe.source.citation} page={recipe.source.pageStart} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Screen>
  )
}
