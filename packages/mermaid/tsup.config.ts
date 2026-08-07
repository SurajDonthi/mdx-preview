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
  // `mermaid` is reached through a dynamic `import()` and is external, so the
  // specifier survives into the output for the consumer's bundler to split.
  splitting: true,
  treeshake: true,
  onSuccess: async () => {
    copyFileSync('src/styles.css', 'dist/styles.css');
  },
});
