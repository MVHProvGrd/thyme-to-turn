import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './screens/Home'

/**
 * The route table. New screens are registered HERE, in one place, plus a nav entry —
 * two known places beats a screen that exists but can't be reached.
 *
 * HashRouter, not BrowserRouter: GitHub Pages serves static files with no rewrite rules,
 * so a hard refresh on /recipe/abc123 would 404. Ugly URL, zero deploy config.
 */
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </HashRouter>
  )
}
