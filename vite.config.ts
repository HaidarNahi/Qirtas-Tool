import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    // Rides along on the service worker's registration URL so each deploy gets
    // its own cache and the previous one is purged. See public/sw.js.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
})
