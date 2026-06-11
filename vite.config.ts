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
