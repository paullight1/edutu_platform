import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA Configuration for Edutu App
 * Provides offline support and installability
 */
export const pwaConfig = VitePWA({
    registerType: 'autoUpdate',
    includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'icons/*.png',
        'robots.txt',
    ],
    manifest: {
        name: 'Edutu - AI Opportunity Coach',
        short_name: 'Edutu',
        description: 'Your AI-powered life operating system for discovering opportunities and achieving goals',
        theme_color: '#6366f1',
        background_color: '#0c0f1a',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['education', 'productivity', 'lifestyle'],
        icons: [
            {
                src: 'icons/icon-72x72.png',
                sizes: '72x72',
                type: 'image/png',
            },
            {
                src: 'icons/icon-96x96.png',
                sizes: '96x96',
                type: 'image/png',
            },
            {
                src: 'icons/icon-128x128.png',
                sizes: '128x128',
                type: 'image/png',
            },
            {
                src: 'icons/icon-144x144.png',
                sizes: '144x144',
                type: 'image/png',
            },
            {
                src: 'icons/icon-152x152.png',
                sizes: '152x152',
                type: 'image/png',
            },
            {
                src: 'icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: 'icons/icon-384x384.png',
                sizes: '384x384',
                type: 'image/png',
            },
            {
                src: 'icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable',
            },
        ],
        shortcuts: [
            {
                name: 'Dashboard',
                short_name: 'Home',
                description: 'View your dashboard',
                url: '/app/home',
            },
            {
                name: 'AI Coach',
                short_name: 'AI',
                description: 'Chat with Edutu AI',
                url: '/app/ai',
            },
        ],
    },
    workbox: {
        // Precache all assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],

        // Runtime caching strategies
        runtimeCaching: [
            {
                // Cache Google Fonts stylesheets
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'google-fonts-stylesheets',
                    expiration: {
                        maxEntries: 10,
                        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                    },
                },
            },
            {
                // Cache Google Fonts webfonts
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'google-fonts-webfonts',
                    expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                    },
                },
            },
            {
                // Cache Supabase API requests (with network first strategy)
                urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
                handler: 'NetworkFirst',
                options: {
                    cacheName: 'supabase-api',
                    expiration: {
                        maxEntries: 100,
                        maxAgeSeconds: 60 * 60, // 1 hour
                    },
                    networkTimeoutSeconds: 5,
                },
            },
            {
                // Cache images
                urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'images',
                    expiration: {
                        maxEntries: 100,
                        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                    },
                },
            },
        ],

        // Skip waiting and activate new service worker immediately
        skipWaiting: true,
        clientsClaim: true,

        // Clean up old caches
        cleanupOutdatedCaches: true,
    },

    // Dev options
    devOptions: {
        enabled: false, // Enable during development if needed
        type: 'module',
    },
});
