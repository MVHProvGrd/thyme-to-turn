import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { ConfirmProvider } from './components/Confirm'
import RecipeList from './screens/RecipeList'
import RecipeDetail from './screens/RecipeDetail'
import RecipeEdit from './screens/RecipeEdit'
import Settings from './screens/Settings'
import Dinner from './screens/Dinner'
import BookList from './screens/BookList'
import BookDetail from './screens/BookDetail'
import BookEdit from './screens/BookEdit'
import BookScan from './screens/BookScan'
import PhotoCrop from './screens/PhotoCrop'
import RecipeParse from './screens/RecipeParse'

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
      <ConfirmProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/dinner" replace />} />
            <Route path="/dinner" element={<Dinner />} />
            <Route path="/recipes" element={<RecipeList />} />
            <Route path="/recipe/:uuid" element={<RecipeDetail />} />
            <Route path="/parse" element={<RecipeParse />} />
            <Route path="/edit" element={<RecipeEdit />} />
            <Route path="/edit/:uuid" element={<RecipeEdit />} />
            <Route path="/recipe/:uuid/photo/:photoUuid/crop" element={<PhotoCrop />} />
            <Route path="/books" element={<BookList />} />
            <Route path="/books/scan" element={<BookScan />} />
            <Route path="/books/new" element={<BookEdit />} />
            <Route path="/book/:uuid" element={<BookDetail />} />
            <Route path="/book/:uuid/edit" element={<BookEdit />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dinner" replace />} />
          </Routes>
        </HashRouter>
      </ConfirmProvider>
    </ToastProvider>
  )
}
