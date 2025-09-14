import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'build',
  format: 'esm',
  watch: ['src/**/*', 'build/index.js'],
});
