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
});
