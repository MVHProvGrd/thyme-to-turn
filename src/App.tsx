import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import RecipeList from './screens/RecipeList'
import RecipeDetail from './screens/RecipeDetail'
import RecipeEdit from './screens/RecipeEdit'
import Settings from './screens/Settings'
import Dinner from './screens/Dinner'

/**
 * The route table. New screens are registered HERE, in one place, plus a nav entry in
 * components/TabBar.tsx — two known places beats a screen that exists but can't be reached.
 *
 * HashRouter, not BrowserRouter: GitHub Pages serves static files with no rewrite rules,
 * so a hard refresh on /recipe/abc123 would 404. Ugly URL, zero deploy config.
 *
 * /dinner is the landing route — it's the product. Everything else feeds it.
 */
export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dinner" replace />} />
          <Route path="/dinner" element={<Dinner />} />
          <Route path="/recipes" element={<RecipeList />} />
          <Route path="/recipe/:uuid" element={<RecipeDetail />} />
          <Route path="/edit" element={<RecipeEdit />} />
          <Route path="/edit/:uuid" element={<RecipeEdit />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dinner" replace />} />
        </Routes>
      </HashRouter>
    </ToastProvider>
  )
}
