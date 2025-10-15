const eslintPluginImport = require('eslint-plugin-import');

module.exports = [
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '**/*.d.ts'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin'),
      'import': eslintPluginImport,
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off', // Will enable in Phase 1
      '@typescript-eslint/no-explicit-any': 'warn', // Warn instead of error for now
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
];
