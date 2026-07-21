'use strict';

const js = require('@eslint/js');
const nodePlugin = require('eslint-plugin-n');
const prettierConfig = require('eslint-config-prettier');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  nodePlugin.configs['flat/recommended-script'],
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'n/no-missing-require': 'off',
      'n/no-extraneous-require': 'off',
      'n/no-unpublished-require': 'off',
    },
  },
  {
    // server.js is the process entrypoint — process.exit() on fatal
    // startup errors and after graceful shutdown is the correct pattern,
    // not a code smell the rule is meant to catch.
    files: ['server.js'],
    rules: { 'n/no-process-exit': 'off' },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: { ...globals.jest, ...globals.node },
    },
    rules: {
      // Test fixtures/helpers are dev-only tooling, not published package code.
      'n/no-extraneous-require': 'off',
    },
  },
  {
    ignores: ['node_modules/**', 'logs/**', 'uploads/**', 'src/config/keys/**', 'coverage/**'],
  },
  prettierConfig,
];
