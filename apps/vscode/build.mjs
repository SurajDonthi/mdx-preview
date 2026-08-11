/**
 * Builds the two bundles the extension ships.
 *
 * 1. `dist/extension.js` - CommonJS for the Node extension host, with `vscode`
 *    left external because the host injects it.
 * 2. `dist/webview/main.js` + `main.css` - the preview page, browser platform.
 *
 * Two decisions worth knowing about:
 *
 * **Workspace packages are resolved to their TypeScript sources**, not to their
 * built `dist`, the same way `apps/studio/vite.config.ts` does it. That means
 * `npm run build` here works in a clean checkout without `build:packages`
 * having run first, and that the preview is always built from the sources in
 * the tree rather than from whatever was last compiled.
 *
 * **The webview bundle is a single IIFE with code splitting off.** A VS Code
 * webview's CSP is a nonce policy, and a nonce is only checked against script
 * *elements* - a chunk pulled in later by `import()` is fetched without one and
 * is refused. Splitting off makes esbuild inline every dynamic import
 * (`import('mermaid')` in @mdxstudio/mermaid, `import('./ChartCanvas')` in
 * @mdxstudio/charts) into the one file the HTML loads with the nonce. It costs
 * a large bundle, which for a local file the webview reads off disk is a
 * trade worth making.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import * as esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '..', '..');

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

/** `@mdxstudio/<name>` -> `packages/<name>/src/index.ts`, and its stylesheet. */
const workspaceSources = {
  plugins: [
    {
      name: 'mdxstudio-workspace-sources',
      setup(build) {
        build.onResolve({ filter: /^@mdxstudio\// }, (args) => {
          const rest = args.path.slice('@mdxstudio/'.length);
          const [name, ...subpath] = rest.split('/');
          const base = path.join(workspaceRoot, 'packages', name, 'src');

          if (subpath.length === 0) {
            return { path: path.join(base, 'index.ts') };
          }
          if (subpath.join('/') === 'styles.css') {
            return { path: path.join(base, 'styles.css') };
          }
          return null;
        });
      },
    },
  ],
};

const shared = {
  bundle: true,
  logLevel: 'info',
  sourcemap: dev ? 'inline' : false,
  minify: !dev,
  legalComments: 'none',
};

const extensionConfig = {
  ...shared,
  ...workspaceSources,
  entryPoints: [path.join(here, 'src', 'extension', 'extension.ts')],
  outfile: path.join(here, 'dist', 'extension.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // Injected by the extension host at runtime; bundling it is an error.
  external: ['vscode'],
};

const webviewConfig = {
  ...shared,
  ...workspaceSources,
  entryPoints: [path.join(here, 'src', 'webview', 'index.tsx')],
  outfile: path.join(here, 'dist', 'webview', 'main.js'),
  platform: 'browser',
  format: 'iife',
  target: ['chrome110'],
  splitting: false,
  jsx: 'automatic',
  loader: { '.css': 'css', '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
  // One React, whichever package asked for it. Same reason apps/studio and the
  // Vitest config dedupe it: two copies means two hook dispatchers.
  alias: {
    react: path.dirname(require.resolve('react/package.json')),
    'react-dom': path.dirname(require.resolve('react-dom/package.json')),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
  },
};

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
  ]);
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('[mdxstudio-vscode] watching');
} else {
  await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)]);
}
