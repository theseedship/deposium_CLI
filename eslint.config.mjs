import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
  // Base ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript files configuration
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2024,
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',

      // General JavaScript/TypeScript rules
      'no-unused-vars': 'off', // Using @typescript-eslint/no-unused-vars instead
      'no-console': 'off', // We're a CLI, console is expected
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'prefer-arrow-callback': 'warn',
      'no-unused-expressions': 'off', // Handled by TS
      'no-undef': 'off', // TypeScript handles this
      eqeqeq: ['error', 'always'],
      curly: ['warn', 'all'],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',

      // Code quality
      complexity: ['warn', 15],
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-params': ['warn', 5],
      'max-depth': ['warn', 4],
      'max-nested-callbacks': ['warn', 4],

      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
    },
  },

  // Disable Prettier conflicts
  prettier,

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      '*.mjs',
      '*.cjs',
      'coverage/**',
      '.husky/**',
      '*.config.js',
      '*.config.mjs',
    ],
  },
];
