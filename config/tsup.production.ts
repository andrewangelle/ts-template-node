import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  splitting: false,
  sourcemap: false,
  clean: true,
  outDir: 'dist',
  format: ['cjs'],
  bundle: true,
  minify: true,

  // By default tsup does not include node_module packages in the bundled output file.
  // Any dependencies imported by our source code need to be listed here so that tsup includes the third party code in the bundle
  noExternal: ['ws'],
});
