import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { devGateway } from './vite-plugins/devGateway';

// https://vite.dev/config/
export default defineConfig({
  // preview 하니스가 PORT 환경변수로 포트를 주입하면 그 포트에 바인딩(프록시 정합).
  server: process.env.PORT ? { port: Number(process.env.PORT), strictPort: true } : undefined,
  // playrecord 편집기(react-rnd)가 참조하는 process.env.DRAGGABLE_DEBUG 를 브라우저 번들에서 정의
  // → 없으면 편집 시 "process is not defined" 크래시.
  define: { 'process.env.DRAGGABLE_DEBUG': 'false' },
  plugins: [react(), devGateway()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // 멀티 페이지 — 메인 앱(index.html) + 보드 카드 iframe이 same-origin으로 임베드하는
      // 뷰어들(슬라이드·게임). 입력을 지정하면 메인도 함께 명시해야 한다.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        slides: path.resolve(__dirname, 'slides-viewer.html'),
        game: path.resolve(__dirname, 'game-viewer.html'),
      },
      output: {
        // Split big libraries into stable, separately-cached vendor chunks so no
        // single chunk dominates the bundle. App code is split per-route via
        // React.lazy (see src/routes.tsx).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          if (
            /(react-markdown|remark|micromark|mdast|hast|unist|unified|vfile|property-information|character-entities|decode-named-character-reference|space-separated-tokens|comma-separated-tokens|trim-lines|html-url-attributes|devlop|estree-util|ccount|markdown-table|zwitch|longest-streak|bail|is-plain-obj|trough|mdurl)/.test(
              id,
            )
          ) {
            return 'markdown';
          }
          return 'vendor';
        },
      },
    },
  },
});
