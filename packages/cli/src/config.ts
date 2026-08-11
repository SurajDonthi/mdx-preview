/**
 * The optional configuration file in the folder being served.
 *
 * Finding it is all the Node half does. The file itself is loaded by the
 * browser, not here: it contributes React components and unified plugins to the
 * renderer, and the renderer runs in the page. The server's part is to notice
 * that the file exists, tell the client its name, and serve it - which the
 * ordinary asset route already does, because it is a file inside the root.
 */
import { stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * What the file may be called, in the order they are tried.
 *
 * `.js` first because a folder that has one is almost never an ESM package as
 * well; `.mjs` is there for the folder that is, where a `.js` file would be
 * read as CommonJS by everything else in the toolchain.
 *
 * The same two names in the same order as `@mdxstudio/core`'s
 * `MDX_CONFIG_FILENAMES`, which is what the VS Code extension looks for -
 * written out again rather than imported because this half of the CLI is the
 * half that has no runtime dependencies, and pulling in core for two strings
 * costs the whole MDX parser chain. `tests/config.test.ts` fails if they drift.
 */
export const CONFIG_FILENAMES = ['mdxstudio.config.js', 'mdxstudio.config.mjs'] as const;

/**
 * The config file in `root`, as a name relative to it, or `null`.
 *
 * Never throws: an unreadable folder means "no config", which is the same thing
 * as not having one, and `serve` has to keep working either way.
 */
export async function findConfigFile(root: string): Promise<string | null> {
  for (const name of CONFIG_FILENAMES) {
    try {
      if ((await stat(path.join(root, name))).isFile()) return name;
    } catch {
      // Not there, or not readable. Try the next name.
    }
  }
  return null;
}
