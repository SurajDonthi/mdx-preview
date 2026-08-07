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
  // The stylesheet ships verbatim instead of through esbuild's CSS pipeline, so
  // a consumer's `import '@mdxstudio/react/styles.css'` gets exactly the rules the
  // source declares - no reordering, no dropped at-rules.
  onSuccess: async () => {
    copyFileSync('src/styles.css', 'dist/styles.css');
  },
});
