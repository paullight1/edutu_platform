import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
    plugins: [react()],
    server: {
        fs: {
            // Vitest runs its own Vite server, so the out-of-root package needs
            // the same allowance the dev server has.
            allow: [resolve(__dirname, '.'), resolve(__dirname, '../packages/ux-state')],
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        // The shared UX-state package has no test runner of its own by design.
        // Running its suite here is also how we prove it parses under Vite's
        // toolchain as well as Metro's.
        include: [
            '**/*.{test,spec}.{ts,tsx}',
            '../packages/ux-state/src/**/*.{test,spec}.{ts,tsx}',
        ],
        exclude: ['node_modules', 'dist', 'android', '.idea'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/test/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/types/**',
                'android/',
            ],
            thresholds: {
                statements: 60,
                branches: 60,
                functions: 60,
                lines: 60,
            },
        },
        // Timeout for async tests
        testTimeout: 10000,
        hookTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
            '@edutu/ux-state': resolve(__dirname, '../packages/ux-state/src'),
        },
    },
});
