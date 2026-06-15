import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { devGateway } from './vite-plugins/devGateway';

// https://vite.dev/config/
export default defineConfig({
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
