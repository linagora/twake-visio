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

// Node.js builtin module names (bare specifiers). `no-restricted-imports`
// below bans both these and their `node:`-prefixed equivalents outside
// `__mocks__/`. See the block that uses this list for why this is an eslint
// rule and not a tsconfig setting.
const nodeBuiltinNames = [
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'diagnostics_channel',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_threads',
  'zlib',
];
const NODE_BUILTIN_MESSAGE =
  'Node.js builtins are not available in React Native and fail at runtime. Only __mocks__/ test doubles (never bundled into the app) may import them.';

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
    // Node.js builtins do not exist in React Native; importing one
    // typechecks but crashes at runtime. This can't be enforced by
    // tsconfig: a Jest mock under __mocks__/ legitimately needs
    // `@types/node` (e.g. `node:crypto`), but a `/// <reference types="node" />`
    // is program-global in TypeScript — once any file carries it, `tsc`
    // resolves Node builtins from every file in the program, not just the
    // one with the reference. __mocks__/ is deliberately excluded from this
    // rule's `files`; everything else that ships in the app is covered.
    files: ['src/**/*.ts', 'src/**/*.tsx', 'app/**/*.ts', 'app/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: nodeBuiltinNames.map((name) => ({ name, message: NODE_BUILTIN_MESSAGE })),
          patterns: [{ group: ['node:*'], message: NODE_BUILTIN_MESSAGE }],
        },
      ],
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
