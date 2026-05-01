// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      '*.config.js',
      'scripts/**',
    ],
  },
  // Phase 5 · Backlog P2 — Flag unused variables / imports in .ts(x) files.
  // We use the @typescript-eslint parser/rule because TS-aware detection
  // also correctly handles type-only imports and re-exports, which the
  // base ESLint rule misses.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      // Turn off the base rule so the TS-aware one can take over.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          // Allow explicit _ prefix as an escape hatch (common convention)
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // React must stay in scope for older JSX transforms; never flag it.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);
