/**
 * Vite plugin that exposes a guest entry as an importable string.
 *
 * ```ts
 * // vite.config.ts
 * plugins: [mdxstudioSandboxGuest({ entry: './src/sandbox-guest.tsx' })]
 *
 * // app code
 * import guestScript from 'virtual:mdxstudio-sandbox-guest';
 * <SandboxedMdx guestScript={guestScript} ... />
 * ```
 *
 * The guest is a second, independent bundle: it never shares a module graph with
 * the application, which is the point - nothing from the app's scope can leak
 * into the frame by accident.
 */

import path from 'node:path';

import { bundleGuest } from './bundleGuest';
import type { BundleGuestOptions } from './bundleGuest';

/**
 * Structural subset of Vite's `Plugin`. Declared here rather than imported so
 * `@mdxstudio/sandbox` does not take a dependency on Vite's types.
 */
export interface ViteDevServerLike {
  watcher: { add(paths: string | string[]): void };
  ws: { send(payload: { type: 'full-reload' }): void };
}

export interface VitePluginLike {
  name: string;
  enforce?: 'pre' | 'post';
  configResolved?: (config: { command: string }) => void;
  configureServer?: (server: ViteDevServerLike) => void;
  resolveId?: (id: string) => string | undefined;
  load?: (id: string) => Promise<string | undefined> | string | undefined;
  handleHotUpdate?: (context: { file: string }) => void;
}

export interface MdxstudioSandboxGuestOptions extends Omit<BundleGuestOptions, 'entry' | 'minify'> {
  /** Guest entry module, relative to the Vite root or absolute. */
  entry: string;
  /** Import specifier. Default `'virtual:mdxstudio-sandbox-guest'`. */
  virtualId?: string;
  /** Default: minify only for `vite build`. */
  minify?: boolean;
}

/**
 * Vite normalises watcher paths to forward slashes; `path.resolve` does not on
 * Windows. Comparing the two raw would silently never match, leaving the guest
 * bundle stale for the whole dev session.
 */
function normalise(file: string): string {
  return path.resolve(file).replace(/\\/g, '/');
}

export function mdxstudioSandboxGuest(options: MdxstudioSandboxGuestOptions): VitePluginLike {
  const virtualId = options.virtualId ?? 'virtual:mdxstudio-sandbox-guest';
  const resolvedId = `\0${virtualId}`;
  const entry = path.resolve(options.entry);

  let isBuild = false;
  let cached: string | null = null;
  let inputs = new Set<string>();
  let server: ViteDevServerLike | null = null;

  return {
    name: '@mdxstudio/sandbox:guest',
    enforce: 'pre',

    configResolved(config) {
      isBuild = config.command === 'build';
    },

    configureServer(devServer) {
      server = devServer;
    },

    resolveId(id) {
      return id === virtualId ? resolvedId : undefined;
    },

    async load(id) {
      if (id !== resolvedId) return undefined;
      if (cached) return cached;

      const bundle = await bundleGuest({
        ...options,
        entry,
        minify: options.minify ?? isBuild,
      });
      inputs = new Set(bundle.inputs.map(normalise));
      // The guest's modules are invisible to Vite: esbuild resolved them, and in
      // a monorepo most of them sit outside the Vite root, so the dev watcher
      // would never see them change. Register them explicitly.
      if (server) server.watcher.add([...inputs]);
      cached = `export default ${JSON.stringify(bundle.code)};`;
      return cached;
    },

    handleHotUpdate({ file }) {
      // The guest bundle is opaque to Vite's module graph, so invalidate it by
      // hand. A guest change means a new frame document, which means a reload.
      if (!inputs.has(normalise(file))) return;
      cached = null;
      server?.ws.send({ type: 'full-reload' });
    },
  };
}
