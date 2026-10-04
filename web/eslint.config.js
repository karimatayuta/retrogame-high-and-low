// Layer boundaries (Clean Architecture): presentation → application → domain.
// infrastructure implements application/domain ports. See ../.specs/web/architecture.md
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const ban = (patterns, message) => ({
  'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
});
const OUTER = ['**/application/**', '**/infrastructure/**', '**/presentation/**', '@/application/*', '@/infrastructure/*', '@/presentation/*'];
const FRAMEWORKS = ['pixi.js', 'pixi-filters', 'gsap', 'gsap/*', 'howler', 'xstate'];

export default tseslint.config(
  { ignores: ['dist/', 'dev-dist/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/domain/**/*.ts'],
    rules: ban([...OUTER, ...FRAMEWORKS], 'domain must stay pure: no outer layers, frameworks, or I/O'),
  },
  {
    files: ['src/application/**/*.ts'],
    rules: ban(
      ['**/infrastructure/**', '**/presentation/**', '@/infrastructure/*', '@/presentation/*', 'pixi.js', 'pixi-filters', 'gsap', 'gsap/*', 'howler'],
      'application may depend on domain (and xstate) only',
    ),
  },
  {
    files: ['src/infrastructure/**/*.ts'],
    rules: ban(['**/presentation/**', '@/presentation/*', 'pixi.js', 'gsap', 'howler'], 'infrastructure must not touch presentation'),
  },
  {
    files: ['scripts/**/*.mjs', 'tests/e2e/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', window: 'readonly', setTimeout: 'readonly', URL: 'readonly', fetch: 'readonly', Buffer: 'readonly', navigator: 'readonly', document: 'readonly' } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
