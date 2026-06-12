import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

/* ESLint v9 flat config (CLAUDE §6: 빌드/린트 통과). 브라우저 소스(src)는 React +
   TS 규칙, Node 측 게이트웨이/Vite 플러그인은 별도 환경으로 분리한다. */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.kv-data', 'public/glb-viewer.html'] },
  {
    // 브라우저 앱 소스 (React + TS)
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // 의도적으로 무시하는 인자/변수는 _ 접두로 표시(노이즈 감소).
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 앱 코드의 console은 금지(개발 도구/영속화의 의도적 로그는 라인 단위 disable로 허용).
      'no-console': 'warn',
    },
  },
  {
    // Node 측: 게이트웨이 핸들러 + Vite 플러그인 + 설정 파일
    files: ['server/**/*.ts', 'vite-plugins/**/*.ts', '*.{js,ts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
