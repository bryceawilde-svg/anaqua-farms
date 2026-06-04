import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      filename: 'sw.js',

      manifest: {
        name: 'BoomLog',
        short_name: 'BoomLog',
        description: 'Spray application planning and tracking for agriculture',
        start_url: '/',
        display: 'standalone',
        background_color: '#0f1f0f',
        theme_color: '#2a5c0f',
        orientation: 'portrait-primary',
        categories: ['agriculture', 'productivity'],
        icons: [
          { src: '/pwa-64x64.png',            sizes: '64x64',   type: 'image/png' },
          { src: '/pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png',           sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },

      workbox: {
        // Precache all built JS/CSS/HTML — loads from device cache after first visit
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        runtimeCaching: [
          // Esri satellite tiles: cache-first, up to 300 tiles, 60 days
          // Tiles never change — after first view the map works offline
          {
            urlPattern: /arcgisonline\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase: network-first with 24hr offline fallback
          {
            urlPattern: /supabase\.co/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 150, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Open-Meteo weather: network-first, 30min cache
          {
            urlPattern: /open-meteo\.com/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 30 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // ZIP lookup: cache a week
          {
            urlPattern: /zippopotam\.us/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'zip-lookup',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 50, maxAgeSeconds: 7 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      devOptions: { enabled: false },
    }),
  ],
})
