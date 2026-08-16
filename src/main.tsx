import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

/**
 * Ask the browser to keep her data. Without this IndexedDB is "best effort", and iOS
 * evicts a PWA's storage after roughly seven days of not being opened — which is exactly
 * the interval at which someone forgets about a recipe app and then comes back to it.
 * The call is silent: it's either granted or it isn't.
 */
void navigator.storage?.persist?.().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
