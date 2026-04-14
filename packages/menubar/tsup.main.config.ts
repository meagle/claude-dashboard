import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/focusTerminal.ts', 'src/trayIcon.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  clean: false,  // Vite also writes to dist/
  external: ['electron'],
  noExternal: [/^@claude-dashboard\//, 'chokidar'],
});
