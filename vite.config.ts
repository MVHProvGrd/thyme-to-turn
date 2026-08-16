import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://mvhprovgrd.github.io/thyme-to-turn/ — the base path must match the
// repo name or every asset 404s on Pages. If the repo is ever renamed, this and APP_NAME
// in src/lib/app.ts are the only two places that know the name.
export default defineConfig({
  base: '/thyme-to-turn/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Precache list is generated from the real build output — never a hand-maintained
      // array. (WordWeft kept two hand-synced lists and the drift broke installability.)
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
      manifest: {
        name: 'Thyme to Turn',
        // iOS truncates home-screen labels around 11-12 chars, so the full name renders
        // as "Thyme to T...". This is the entire reason short_name is set.
        short_name: 'Thyme',
        description: "Alisa's cookbook. Mark what you're out of, find out what's for dinner.",
        theme_color: '#2F5320',
        background_color: '#F6F3E9',
        display: 'standalone',
        start_url: '/thyme-to-turn/',
        scope: '/thyme-to-turn/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
