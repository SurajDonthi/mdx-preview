import { defineConfig } from 'tsup';

/**
 * A Node CLI, not a browser bundle. `platform: 'node'` keeps `node:` builtins
 * external; there are no runtime dependencies to bundle in the first place.
 *
 * `splitting` is off so `cli.js` stays a single file with its hashbang on line
 * one - a shared chunk would put an import above it.
 */
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
