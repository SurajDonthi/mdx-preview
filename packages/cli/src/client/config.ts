/**
 * Loading `mdxstudio.config.js` from the folder being served.
 *
 * The contract - what the file exports, what a function form is called with,
 * what a broken one reports - is `@mdxstudio/core`'s, because the VS Code
 * extension loads the same file and the two must not drift. All the CLI adds is
 * where it imports from: the served root, over HTTP, which the ordinary asset
 * route already answers because the file is inside that root.
 *
 * See `../config.ts` for the Node half, which only has to notice that the file
 * exists.
 */

export { configSource, loadMdxConfig } from '@mdxstudio/core';
export type {
  MdxConfigContext,
  LoadedMdxConfig,
  LoadMdxConfigOptions,
} from '@mdxstudio/core';
