// Expo's own flat config, pinned to the SDK we ship (eslint-config-expo 56.x
// tracks SDK 56). It already brings the react / react-hooks / react-native and
// import rules Expo treats as baseline; everything below is scope and tuning
// for this codebase, with a reason for each.
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

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
    rules: {
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
    // React Compiler rules, new in eslint-plugin-react-hooks v6 and switched on
    // as errors by Expo's config. They flag ~250 findings across this app —
    // real signal, but adopting them is its own project, not a prerequisite for
    // having CI at all. Keep them visible as warnings so the backlog is honest,
    // and let CI gate on genuine errors today.
    rules: {
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/incompatible-library': 'warn',
      // Anonymous components in memo()/forwardRef: cosmetic (devtools naming).
      'react/display-name': 'warn',
    },
  },

  {
    // Node tooling, not app code: these run under node, not the RN runtime.
    files: ['scripts/**', 'plugins/**', 'jest.setup.ts', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node },
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
