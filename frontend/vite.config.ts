/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// In development the browser talks only to Vite; Vite forwards /api to Flask.
// Same origin = no CORS setup, and the session cookie just works. `vite preview` (the built app) does the same.
// The browser tests run their own backend, on another port (API_PROXY_TARGET, see playwright.config.ts).
const proxy = { '/api': process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:5000' }

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app + service worker (Stage 8). The service worker caches only the app itself (HTML, JS, CSS,
    // icons) so it opens without a connection. Your data is never cached by it: the few things readable offline
    // are kept by the app (src/lib/offline.ts), and /api requests always go to the network.
    VitePWA({
      registerType: 'prompt', // a new version waits for "Reload", so nothing you're typing is lost
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'notify-sw.js'],
      manifest: {
        name: 'Life OS',
        short_name: 'Life OS',
        description: 'Your private planner: tasks, calendar, goals, habits and journal.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f2f2f7',
        theme_color: '#f2f2f7',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        importScripts: ['notify-sw.js'], // opens the right page when a reminder is tapped (lib/reminders.ts)
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than the app: in their own files, a phone keeps them cached across
        // app updates and re-downloads only the small app file.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router', 'scheduler'],
          data: ['@tanstack/react-query', '@tanstack/react-query-persist-client', '@tanstack/query-sync-storage-persister', 'i18next', 'react-i18next'],
          forms: ['react-hook-form', 'zod', '@hookform/resolvers'],
        },
      },
    },
  },
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**'], // e2e/ holds Playwright tests (npm run e2e), not Vitest ones
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
})
