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
  // Required: `ChartCanvas` - the only module that touches Recharts - is loaded
  // with a dynamic `import()`, and splitting is what turns that into its own
  // chunk instead of inlining it back into the entry.
  splitting: true,
  treeshake: true,
  onSuccess: async () => {
    copyFileSync('src/styles.css', 'dist/styles.css');
  },
});
