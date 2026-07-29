// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Project-wide rules that are not negotiable, see docs/superpowers/specs.
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Enums are not allowed; use a readonly object or a union of string literals instead.',
        },
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Default exports are not allowed; use a named export instead.',
        },
      ],
    },
  },
  {
    // expo-router requires a default export for every route file under app/.
    files: ['app/**/*.ts', 'app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Enums are not allowed; use a readonly object or a union of string literals instead.',
        },
      ],
    },
  },
]);
