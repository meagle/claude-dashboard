import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/hook.ts'],
  format: ['cjs'],
  target: 'node18',
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  clean: true,
  // Bundle all dependencies (including @claude-dashboard/shared) into one file
  // so hook.js is self-contained when copied to ~/.claude/dashboard/
  noExternal: [/^@claude-dashboard\//],
});
