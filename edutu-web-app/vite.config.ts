import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png', 'icons/*.png', 'data/opportunities.json'],
      manifest: {
        name: 'Edutu | AI Opportunity Coach',
        short_name: 'Edutu',
        description: 'Discover scholarships, internships, grants and career opportunities, then turn them into personalized goals, roadmaps and applications with AI guidance.',
        theme_color: '#146ef5',
        background_color: '#0c0f1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/dashboard',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Adds notificationclick + push handlers on top of the generated SW.
        importScripts: ['sw-custom.js'],
        runtimeCaching: [
          {
            // Product API (opportunities, recommendations, profile, deadlines…).
            // Network-first so signed-in users get fresh data online, but fall
            // back to the last successful response when the network is gone.
            urlPattern: /^https:\/\/edutu-platform\.onrender\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'edutu-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 80,
                maxAgeSeconds: 60 * 60 * 24, // 1 day
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Static opportunities snapshot used as the offline fallback feed.
            urlPattern: ({ url }) => url.pathname === '/data/opportunities.json',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'edutu-snapshot',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Opportunity banner imagery — cache so cards keep their images
            // offline and on repeat visits.
            urlPattern: /^https:\/\/images\.(pexels|unsplash)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'edutu-images',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
        ],
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom')) return 'react-vendor';
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/lucide-react')) return 'ui-vendor';
          if (id.includes('node_modules/@supabase/supabase-js')) return 'supabase-vendor';
          if (id.includes('node_modules/recharts')) return 'charts-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
});
