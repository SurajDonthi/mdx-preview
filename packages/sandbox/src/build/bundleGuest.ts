/**
 * Build-time helper: turns a guest entry module into a single standalone script.
 *
 * The guest cannot fetch anything - it has an opaque origin and a CSP with
 * `connect-src 'none'` - so its runtime has to be handed to it as source text,
 * inlined into the frame document. That means the whole renderer, React
 * included, is bundled here into one IIFE.
 *
 * Node-only. Not part of the browser build.
 */

import { build } from 'esbuild';

export interface BundleGuestOptions {
  /** Absolute path to the guest entry module. */
  entry: string;
  /** Default `true`. Disable to make the frame's stack traces readable. */
  minify?: boolean;
  /** Extra `esbuild` defines, merged over `process.env.NODE_ENV`. */
  define?: Record<string, string>;
  /** Module aliases, for repositories that do not rely on node resolution. */
  alias?: Record<string, string>;
  /** Default `'react'`. */
  jsxImportSource?: string;
  /** Default `'es2022'`. */
  target?: string | string[];
}

export interface GuestBundle {
  /** The script, ready to inline into the frame document. */
  code: string;
  /** Every file the bundle was built from. Feed to a watcher in dev. */
  inputs: string[];
}

export async function bundleGuest(options: BundleGuestOptions): Promise<GuestBundle> {
  const result = await build({
    entryPoints: [options.entry],
    bundle: true,
    // IIFE, not ESM: `<script type="module">` in a `srcdoc` document resolves
    // relative specifiers against `about:srcdoc` and is subject to the CSP's
    // module rules. A classic inline script has neither problem.
    format: 'iife',
    platform: 'browser',
    target: options.target ?? 'es2022',
    // ASCII output keeps the bundle safe to embed in an HTML document whose
    // charset the host does not control.
    charset: 'ascii',
    jsx: 'automatic',
    jsxImportSource: options.jsxImportSource ?? 'react',
    minify: options.minify ?? true,
    legalComments: 'none',
    metafile: true,
    write: false,
    alias: options.alias,
    define: {
      'process.env.NODE_ENV': JSON.stringify('production'),
      ...options.define,
    },
  });

  const output = result.outputFiles?.[0];
  if (!output) throw new Error('[@mdxstudio/sandbox] esbuild produced no guest bundle.');

  return {
    code: output.text,
    inputs: Object.keys(result.metafile?.inputs ?? {}),
  };
}
