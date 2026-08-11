import { copyFileSync } from 'node:fs';

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  target: 'es2022',
  platform: 'browser',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: true,
  treeshake: true,
  onSuccess: async () => {
    copyFileSync('src/styles.css', 'dist/styles.css');
  },
});
