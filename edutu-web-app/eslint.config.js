import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'src/services/admin/index.ts',
      'src/services/admin/marketplaceAdmin.ts',
      'src/services/admin/opportunities.ts',
      'src/services/admin/opportunitiesSupabase.ts',
      'src/services/admin/opportunitiesWebhook.ts'
    ]
  },
  {
    // The hand-written service worker imported by the generated one. Only the
    // ts/tsx block below used to match, so no rule ever ran here and its
    // `eslint-disable no-undef` sat dead. Lint it with the service-worker
    // globals so `self`/`clients`/`registration` resolve for real.
    files: ['public/sw-custom.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: { ...globals.serviceworker, ...globals.browser },
    },
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      // The codebase already uses a leading underscore to mark something as
      // deliberately unused (_error, _signal, _currentPassword…); honour it
      // rather than making people delete params they need for arity.
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'prefer-const': 'warn',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
    },
  }
);
