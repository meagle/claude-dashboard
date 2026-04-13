import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: false, // don't wipe main.js compiled by tsc
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'),
    },
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@claude-dashboard/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  test: {
    root: __dirname,
    environment: 'jsdom',
    globals: true,
    setupFiles: [path.resolve(__dirname, 'src/renderer/setupTests.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['dist/**'],
  },
});
