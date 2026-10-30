import js from '@eslint/js';
import globals from 'globals';
import { blacklight } from 'eslint-plugin-blacklight';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '.claude/**',
      '**/coverage/**',
      '**/.blacklight/**',
      'packages/vscode/{dist-webview,dist-test,schema,.vscode-test}/**',
      'docs/.vitepress/cache/**',
      'docs/.vitepress/dist/**',
      'docs/public/runner/**',
      'docs/api/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  // Online simulation code must be deterministic (NET-03): *-online/ and sim/ folders, marked classes.
  ...blacklight.configs.recommended,
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] } },
    rules: {
      // Screens are named after their file (PauseMenu.vue, Hud.vue): single words are fine.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Base-class hooks document their parameters with a leading underscore.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Engine packages export named symbols only; games may use default exports (CLAUDE.md).
    files: ['packages/*/src/**/*.ts'],
    ignores: ['**/*.d.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Engine packages use named exports.' },
      ],
    },
  },
);
