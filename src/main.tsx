import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/700.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI).toString()).catch(() => {
      /* offline support is a bonus, never a blocker */
    })
  })
}

// Warm the PDF chunks once the app is idle so the export still works offline
// and feels instant the first time a teacher taps download.
const warm = () => {
  void import('html-to-image')
  void import('jspdf')
}
if ('requestIdleCallback' in window) {
  ;(window as unknown as { requestIdleCallback: (cb: () => void, o?: object) => void }).requestIdleCallback(warm, {
    timeout: 6000,
  })
} else {
  setTimeout(warm, 3000)
}
