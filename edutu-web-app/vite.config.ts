import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { validateLocalClerkPublishableKey } from './src/lib/clerkEnvironment';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const clerkConfigurationError = validateLocalClerkPublishableKey(
    env.VITE_CLERK_PUBLISHABLE_KEY,
    command === 'serve',
  );
  if (clerkConfigurationError) {
    throw new Error(clerkConfigurationError);
  }

  const configuredApiUrl =
    env.VITE_API_URL || env.VITE_API_BASE_URL || 'https://edutu-platform.onrender.com';
  let apiOrigin: string;
  try {
    apiOrigin = new URL(configuredApiUrl).origin;
  } catch {
    throw new Error(`VITE_API_URL must be an absolute URL. Received: ${configuredApiUrl}`);
  }

  // RegExp patterns are embedded directly into the generated service worker,
  // unlike callback patterns which are stringified and cannot safely close over
  // build-time variables. Query strings are intentionally allowed.
  const publicApiCachePattern = new RegExp(
    `^${escapeRegExp(apiOrigin)}/(?:` +
      'blog(?:/[^?]*)?|' +
      'events(?:/[^?]*)?|' +
      'roadmaps/templates|' +
      'opportunities(?:/search|/(?!search(?:/|$)|preferences(?:/|$)|match-scores(?:/|$)|signals(?:/|$)|sync(?:/|$)|admin(?:/|$)|apify-sync(?:/|$))[^/?]+(?:/share-pdf)?)?' +
      ')(?:\\?.*)?$',
  );

  return {
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
          globIgnores: [
            'og/*',
            '**/og/*',
            'illustrations/beliefs-sheet*.png',
          ],
          importScripts: ['sw-custom.js'],
          runtimeCaching: [
            {
              // Only public catalogue/content reads are cacheable here. The API
              // origin is derived from the build environment so preview/staging
              // builds cannot accidentally route cache policy to production.
              // User-scoped routes are deliberately excluded by the pattern.
              urlPattern: publicApiCachePattern,
              handler: 'NetworkFirst',
              method: 'GET',
              options: {
                cacheName: 'edutu-catalog',
                networkTimeoutSeconds: 8,
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname === '/data/opportunities.json',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'edutu-snapshot',
                expiration: {
                  maxEntries: 4,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/images\.(pexels|unsplash)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'edutu-images',
                expiration: {
                  maxEntries: 120,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
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
        allow: [resolve(__dirname, '.'), resolve(__dirname, '../packages/ux-state')],
      },
    },
    build: {
      rollupOptions: {
        output: {
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
  };
});
