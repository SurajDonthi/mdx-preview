/**
 * Builds the browser half of the CLI into `dist/client/`.
 *
 * Why a prebuilt bundle and not a dev server started at run time: `mdxstudio
 * serve` is pointed at somebody's documentation folder, which is very often not
 * a JavaScript project at all - no node_modules, no bundler, sometimes no
 * network. Compiling React, Mermaid and Recharts on every start would make the
 * command slow, fragile, and dependent on what happens to be installed next to
 * the documents. Bundling once, here, makes `serve` a static file server plus a
 * watcher, and that is a thing that cannot break in the field.
 *
 * The `@mdxstudio/*` aliases mirror `apps/studio/vite.config.ts` exactly, so
 * the CLI renders documents with the same sources the web application does.
 */
import { createRequire } from 'node:module';
import { cp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const require_ = createRequire(import.meta.url);

const source = (name) => path.resolve(workspaceRoot, `packages/${name}/src/index.ts`);
const stylesheet = (name) => path.resolve(workspaceRoot, `packages/${name}/src/styles.css`);

const outdir = path.join(packageRoot, 'dist', 'client');

/**
 * KaTeX's stylesheet and fonts are copied beside the bundle rather than pulled
 * through it. `src/client/katexStylesheet.ts` explains why; the short version is
 * that esbuild would otherwise duplicate the stylesheet into the entry sheet
 * that every document loads, math or not.
 */
const katexDist = path.dirname(require_.resolve('katex/package.json')) + '/dist';

await rm(outdir, { recursive: true, force: true });

const result = await build({
  entryPoints: [path.join(packageRoot, 'src/client/main.tsx')],
  outdir,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  // Mermaid and Recharts are behind dynamic imports inside their packages;
  // splitting is what keeps them out of the first load.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  minify: true,
  legalComments: 'none',
  sourcemap: false,
  metafile: true,
  jsx: 'automatic',
  jsxImportSource: 'react',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  alias: {
    // Stylesheet entries first: a bare package alias also matches its subpaths,
    // so `@mdxstudio/react/styles.css` would otherwise be rewritten to
    // `.../src/index.ts/styles.css`.
    'katex/dist/katex.min.css': path.resolve(packageRoot, 'src/client/katexStylesheet.ts'),
    '@mdxstudio/react/styles.css': stylesheet('react'),
    '@mdxstudio/mermaid/styles.css': stylesheet('mermaid'),
    '@mdxstudio/charts/styles.css': stylesheet('charts'),
    '@mdxstudio/flow/styles.css': stylesheet('flow'),
    '@mdxstudio/core': source('core'),
    '@mdxstudio/react': source('react'),
    '@mdxstudio/mermaid': source('mermaid'),
    '@mdxstudio/charts': source('charts'),
    '@mdxstudio/flow': source('flow'),
  },
  loader: {
    '.png': 'file',
    '.jpg': 'file',
    '.svg': 'file',
    '.woff': 'file',
    '.woff2': 'file',
  },
  logLevel: 'warning',
});

// After the bundle, so the cleaned output directory exists. The fonts keep the
// layout the stylesheet's own relative URLs expect.
await cp(path.join(katexDist, 'katex.min.css'), path.join(outdir, 'katex.css'));
await cp(path.join(katexDist, 'fonts'), path.join(outdir, 'fonts'), { recursive: true });

// The metafile stays in memory: it is 2 MB, and everything under dist/ ships.
const outputs = Object.entries(result.metafile.outputs)
  .map(([file, meta]) => ({ file: path.relative(packageRoot, file).split(path.sep).join('/'), bytes: meta.bytes }))
  .sort((left, right) => right.bytes - left.bytes);

const total = outputs.reduce((sum, output) => sum + output.bytes, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} kB`;

console.log(`[@mdxstudio/cli] browser bundle: ${kb(total)} across ${outputs.length} files`);
for (const output of outputs.slice(0, 6)) {
  console.log(`  ${kb(output.bytes).padStart(8)}  ${output.file}`);
}
if (outputs.length > 6) console.log(`  ${String(outputs.length - 6).padStart(8)}  more`);
