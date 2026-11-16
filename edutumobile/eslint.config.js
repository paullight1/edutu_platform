// Expo's own flat config, pinned to the SDK we ship (eslint-config-expo 56.x
// tracks SDK 56). It already brings the react / react-hooks / react-native and
// import rules Expo treats as baseline; everything below is scope and tuning
// for this codebase, with a reason for each.
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');
const unusedImports = require('eslint-plugin-unused-imports');

module.exports = [
  {
    ignores: [
      // Native build output — not ours to lint.
      'android/**',
      'ios/**',
      '.expo/**',
      'dist/**',
      'expo-env.d.ts',
      'widgets/**/build/**',
      // Deno edge functions. They import straight from URLs
      // (https://deno.land/..., https://esm.sh/...), which this resolver
      // cannot follow, so every import reads as unresolved. They are deployed
      // by the Supabase CLI and are not part of the Expo app.
      'supabase/functions/**',
    ],
  },

  ...(Array.isArray(expoConfig) ? expoConfig : [expoConfig]),

  {
    plugins: {
      'unused-imports': unusedImports,
    },
    rules: {
      // Split unused-import detection out of no-unused-vars so it is
      // autofixable — `npm run lint:fix` deletes dead imports instead of just
      // complaining about them.
      'unused-imports/no-unused-imports': 'warn',

      // require() is load-bearing in this app, not laziness:
      //  - jest mock factories are hoisted, so they cannot use static imports;
      //  - lib/widget*.ts and lib/i18n require optional native modules
      //    (expo-widgets, expo-file-system, expo-asset) lazily so a missing
      //    native module degrades instead of crashing at boot.
      // Every app-code use is typed with `as typeof import(...)`.
      '@typescript-eslint/no-require-imports': 'off',

      // Purely stylistic (T[] vs Array<T>) and the codebase mixes both.
      '@typescript-eslint/array-type': 'off',
    },
  },

  {
    // Scoped to the files where expo's config defines the @typescript-eslint
    // plugin — an options array forces plugin resolution, so a global object
    // would error on plain .js files. Leading underscore marks something as
    // deliberately unused, same convention as the web and admin workspaces.
    files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },

  // NOTE: the React Compiler rules (react-hooks/refs, set-state-in-effect,
  // immutability, purity, static-components, preserve-manual-memoization,
  // globals) run at Expo's default ERROR severity. The ~250-finding backlog
  // was cleared in July 2026; the survivors are per-line eslint-disables with
  // written justifications (Reanimated SharedValue writes, one metering
  // effect, one param-driven auto-send). Don't re-downgrade these to warnings
  // — fix or justify per line.

  {
    // Node tooling, not app code: these run under node, not the RN runtime.
    files: ['scripts/**', 'plugins/**', 'jest.setup.ts', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  {
    // Test files: jest.mock factories return anonymous stub components by
    // design — naming every mock buys nothing (display-name exists for
    // devtools, which never see these).
    files: ['__tests__/**', '**/*.test.*', 'jest.setup.ts', 'test-utils/**'],
    rules: {
      'react/display-name': 'off',
    },
  },

  {
    // TypeScript declaration merging (`export const Audio` + `export namespace
    // Audio`) is valid, but eslint-plugin-import reads it as a duplicate export.
    files: ['**/*.d.ts'],
    rules: {
      'import/export': 'off',
    },
  },
];
