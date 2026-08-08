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
        // Marketing Open Graph captures are ~250 KB each and are only ever
        // fetched by social crawlers server-side — precaching them would put
        // several MB of images no user ever sees into every install.
        globIgnores: [
          'og/*',
          '**/og/*',
          // This editorial illustration is served normally but is too large
          // for Workbox's 2 MiB precache ceiling. Keeping it out of install
          // avoids failing the entire production build.
          'illustrations/beliefs-sheet*.png',
        ],
        // Adds notificationclick + push handlers on top of the generated SW.
        importScripts: ['sw-custom.js'],
        runtimeCaching: [
          {
            // Public catalog reads — identical for every visitor, so the cached
            // copy paints instantly and revalidates behind the scenes instead of
            // blocking on the network every time.
            //
            // The allowlist is deliberate. Everything user-scoped stays on
            // NetworkFirst below, because stale-while-revalidate serves the
            // cache *first*: on a shared browser, or after signing in as someone
            // else, it would paint the previous user's data before revalidating.
            // Note match-scores/preferences/signals/admin sit under the
            // /opportunities prefix, so a prefix match would wrongly catch them.
            //
            // This runs in the generated service worker, so it must stay
            // self-contained — it is serialised via toString() and any
            // reference to an outer binding would throw there.
            urlPattern: ({ url, request }) => {
              if (request.method !== 'GET') return false;
              if (url.origin !== 'https://edutu-platform.onrender.com') return false;
              const p = url.pathname;
              if (p === '/blog' || p.startsWith('/blog/')) return true;
              if (p === '/events' || p.startsWith('/events/')) return true;
              if (p === '/roadmaps/templates') return true;
              if (p === '/opportunities' || p === '/opportunities/search') return true;
              // /opportunities/:id and /opportunities/:id/share-pdf only.
              const m = p.match(/^\/opportunities\/([^/]+)(?:\/share-pdf)?$/);
              return (
                !!m &&
                ![
                  'search',
                  'preferences',
                  'match-scores',
                  'signals',
                  'sync',
                  'admin',
                  'apify-sync',
                ].includes(m[1])
              );
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'edutu-catalog',
              expiration: {
                maxEntries: 120,
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
      '@edutu/ux-state': resolve(__dirname, '../packages/ux-state/src'),
    },
  },
  server: {
    fs: {
      // The shared UX-state package sits outside this app's root. Without this
      // the production build succeeds and only `npm run dev` 403s, which is an
      // easy failure to miss in CI.
      allow: [resolve(__dirname, '.'), resolve(__dirname, '../packages/ux-state')],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Strip every console.* (and debugger) from production bundles — same
        // contract as src/lib/logger.ts, extended to raw console calls so
        // internal errors never surface in end users' devtools. Sentry
        // captureException is unaffected; dev keeps full logging (the dev
        // server never runs this minify pass).
        minify: {
          compress: { dropConsole: true, dropDebugger: true },
          mangle: true,
          codegen: true,
        },
        manualChunks(id: string) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router-dom')) return 'react-vendor';
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/lucide-react')) return 'ui-vendor';
          if (id.includes('node_modules/@supabase/supabase-js')) return 'supabase-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
});
