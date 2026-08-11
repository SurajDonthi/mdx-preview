import { defineConfig } from 'tsup';

/**
 * The Node half only. `src/client/**` is a browser bundle and is built
 * separately by `scripts/build-client.mjs`.
 *
 * `platform: 'node'` keeps `node:` builtins external; there are no runtime
 * dependencies to bundle in the first place. `splitting` is off so `cli.js`
 * keeps its hashbang on line one - a shared chunk would put an import above it.
 */
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
