import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'src/admin/AdminApp.tsx',
      'src/components/admin',
      'src/services/admin/index.ts',
      'src/services/admin/marketplaceAdmin.ts',
      'src/services/admin/opportunities.ts',
      'src/services/admin/opportunitiesSupabase.ts',
      'src/services/admin/opportunitiesWebhook.ts'
    ]
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
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'prefer-const': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
    },
  }
);
