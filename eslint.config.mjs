import tseslint from 'typescript-eslint';
export default [
  { ignores: ['node_modules/**', '.next/**', 'tmp/**', 'tests/**', 'next-env.d.ts'] },
  { files: ['**/*.{ts,tsx,js,mjs}'], languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } }, rules: {
    'constructor-super':'error', 'no-debugger':'error', 'no-dupe-args':'error', 'no-dupe-keys':'error',
    'no-duplicate-case':'error', 'no-func-assign':'error', 'no-unreachable':'error',
    'no-unsafe-finally':'error', 'valid-typeof':'error', 'no-eval':'error', 'no-implied-eval':'error',
  } },
];
