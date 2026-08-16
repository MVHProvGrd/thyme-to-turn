import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import Screen, { ScreenHeader } from '../components/Screen'
import { SearchField } from '../components/Field'
import SourceLine from '../components/SourceLine'
import EmptyState from '../components/EmptyState'
import Button from '../components/Button'
import { listRecipes } from '../db/repo'
import { searchRecipes } from '../lib/search'

/**
 * Find a recipe. Rows wrap rather than truncate — her titles run to nine words, and a
 * title she can't read is a recipe she can't find.
 */
export default function RecipeList() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const recipes = useLiveQuery(listRecipes, [], undefined)

  const results = useMemo(() => (recipes ? searchRecipes(recipes, query) : []), [recipes, query])

  return (
    <Screen
      header={
        <ScreenHeader
          title="Recipes"
          action={
            <Button variant="secondary" onClick={() => navigate('/edit')}>
              + Add
            </Button>
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

        {recipes === undefined ? null : recipes.length === 0 ? (
          <div className="pt-6">
            <EmptyState
              line="Nothing in the box yet. Type in a recipe you already know by heart."
              action={<Button onClick={() => navigate('/edit')}>Add a recipe</Button>}
            />
          </div>
        ) : results.length === 0 ? (
          <p className="pt-6 font-mono text-xs text-ink-soft">No recipe by that name.</p>
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
