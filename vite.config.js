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

        // Only cache tiles — API calls (Supabase, weather, ZIP) bypass the SW
        // entirely so they go direct to the network at full speed.
        // The app manages its own data sync via realtime + polling.
        runtimeCaching: [
          {
            urlPattern: /arcgisonline\.com/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'esri-tiles',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },

      devOptions: { enabled: false },
    }),
  ],
})
