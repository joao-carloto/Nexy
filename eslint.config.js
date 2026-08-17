import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    // electron/wizard/*.js runs in a sandboxed renderer (browser globals, no
    // Node), same as everything under public/ -- excluded for the same reason.
    ignores: ['node_modules/', 'public/', 'electron/wizard/*.js'],
  },
  js.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
];
