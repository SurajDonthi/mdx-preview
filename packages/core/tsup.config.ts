import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin } from 'esbuild';
import { defineConfig } from 'tsup';

const require_ = createRequire(import.meta.url);

/**
 * The one acorn build, whichever way it is asked for.
 *
 * `acorn` publishes its CommonJS and ES module builds as two separate files and
 * picks between them on the `require`/`import` condition. The MDX chain asks for
 * it both ways - `micromark-extension-mdxjs` does `import {Parser} from 'acorn'`
 * while `acorn-jsx` is CommonJS and does `require('acorn')` - so a bundler that
 * honours those conditions faithfully ends up with *both* files, about 122 kB of
 * duplicated parser.
 *
 * Redirecting every request to the ES module build collapses the two back into
 * one. It has to happen here, in this package's own build, rather than in an
 * application's bundler config: an alias in `apps/studio` would fix this repo
 * and nobody else's installation.
 */
function singleAcornBuild(): Plugin {
  // `acorn`'s `exports` map does not expose `./dist/acorn.mjs`, so the path is
  // derived from the one subpath it does expose.
  const acornMjs = path.join(path.dirname(require_.resolve('acorn/package.json')), 'dist', 'acorn.mjs');

  return {
    name: 'single-acorn-build',
    setup(build) {
      build.onResolve({ filter: /^acorn$/ }, () => ({ path: acornMjs }));
    },
  };
}

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
  // Only the modules that touch acorn are inlined, so this package - not the
  // consumer's bundler - decides which acorn build is used. Everything else in
  // the MDX chain (`mdast-util-mdx`, the `micromark-extension-mdx-*` packages,
  // `unified`, `remark-parse`, ...) stays external and dedupes normally.
  //
  // `remark-mdx` stays a runtime dependency even though its own wrapper is
  // inlined here: it is what pulls the external half of that chain into a
  // consumer's `node_modules`.
  noExternal: ['remark-mdx', 'micromark-extension-mdxjs', 'acorn', 'acorn-jsx'],
  esbuildPlugins: [singleAcornBuild()],
});
