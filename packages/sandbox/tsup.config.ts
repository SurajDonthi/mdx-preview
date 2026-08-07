import { defineConfig } from 'tsup';

/**
 * Two configs, because the package spans two runtimes. tsup runs an array of
 * configs concurrently, so neither may set `clean` - the `build` script wipes
 * `dist` first instead, otherwise one config's clean races the other's output.
 */
const shared = {
  format: ['esm'] as const,
  target: 'es2022',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: false,
  splitting: true,
  treeshake: true,
};

export default defineConfig([
  {
    ...shared,
    // The host, the guest runtime and the wire protocol all run in a browser.
    // `protocol` is shared by the first two, so splitting hoists it into a chunk
    // rather than emitting it twice.
    entry: {
      index: 'src/index.ts',
      guest: 'src/guest/index.ts',
      'guest/mdx': 'src/guest/mdxGuest.tsx',
      protocol: 'src/protocol.ts',
    },
    platform: 'browser',
  },
  {
    ...shared,
    // `./vite` and `./build` are build-time tooling: they run in Node, shell out
    // to esbuild, and never reach the browser.
    entry: {
      vite: 'src/build/vitePlugin.ts',
      build: 'src/build/bundleGuest.ts',
    },
    platform: 'node',
  },
]);
