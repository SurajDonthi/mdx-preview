/**
 * Finding the workspace's `mdxstudio.config.js`.
 *
 * The extension's half of the job is the same as the CLI's (`packages/cli/src/
 * config.ts`): notice which file exists and hand its location over. The file
 * itself is loaded by the webview, because that is where the renderer is - see
 * `@mdxstudio/core`'s `mdxConfig.ts` for why a component cannot be read in the
 * extension host and posted across.
 *
 * Free of any `vscode` import, like `policy.ts`: this decides *where* to look,
 * `preview.ts` does the looking. A rule about which folder a repository's code
 * may be executed from is worth being able to test without an editor.
 */

import * as path from 'node:path';

import { MDX_CONFIG_FILENAMES } from '@mdxstudio/core';

import type { ConfigPolicy } from './policy';

/** The two names, in the order they are tried. Shared with the CLI. */
export const CONFIG_FILENAMES = MDX_CONFIG_FILENAMES;

/** What a candidate path is relative to. */
export type ConfigBase =
  /** The workspace folder the previewed document belongs to. */
  | 'folder'
  /** The document's own directory - only when it belongs to no folder. */
  | 'document'
  /** Already absolute; nothing to resolve it against. */
  | 'absolute';

export interface ConfigLocation {
  base: ConfigBase;
  path: string;
}

/**
 * Every file to try, in order. The first that exists wins; an empty list means
 * there is nothing to look for.
 *
 * **Discovery is the workspace folder that owns the document, and only that
 * one.** In a multi-root workspace each root therefore gets its own config, and
 * a document is rendered with the config of the root it lives in - never with a
 * sibling root's. The alternative, searching every root or falling back to the
 * first, would mean adding a folder to a workspace could change how an
 * unrelated folder's documents render, which is both surprising and a way to
 * get a repository's code loaded by opening a different repository beside it.
 *
 * Discovery also stops at the workspace: a loose file opened without a folder
 * has no project to take a config from, so it gets none. Naming a file in
 * `mdxstudio.config` is the way to say otherwise, and an absolute path there is
 * the only way a file outside the workspace is ever reached.
 */
export function configLocations(policy: ConfigPolicy, hasFolder: boolean): ConfigLocation[] {
  if (policy.off) return [];

  if (policy.path) {
    if (path.isAbsolute(policy.path)) return [{ base: 'absolute', path: policy.path }];
    return [{ base: hasFolder ? 'folder' : 'document', path: policy.path }];
  }

  if (!hasFolder) return [];
  return CONFIG_FILENAMES.map((name) => ({ base: 'folder' as const, path: name }));
}
