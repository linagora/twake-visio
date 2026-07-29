// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const banEnum = {
  selector: 'TSEnumDeclaration',
  message: 'Enums are not allowed; use a readonly object or a union of string literals instead.',
};
const banDefaultExport = {
  selector: 'ExportDefaultDeclaration',
  message: 'Default exports are not allowed; use a named export instead.',
};
const banDoubleUnknownAssertion = {
  selector:
    "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
  message: 'Do not double-assert through `unknown`; fix the underlying type instead.',
};

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
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowIIFEs: true,
        },
      ],
      'no-restricted-syntax': ['error', banEnum, banDefaultExport, banDoubleUnknownAssertion],
    },
  },
  {
    // expo-router requires a default export for every route file under app/;
    // the `unknown` double-assertion ban still applies to route files.
    files: ['app/**/*.ts', 'app/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', banEnum, banDoubleUnknownAssertion],
    },
  },
  {
    // Tests legitimately mock globals (e.g. `global.fetch`) via a double
    // assertion through `unknown`; enum and default-export bans still apply.
    files: ['**/*.spec.ts', '**/*.spec.tsx'],
    rules: {
      'no-restricted-syntax': ['error', banEnum, banDefaultExport],
    },
  },
]);
