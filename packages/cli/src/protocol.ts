/**
 * The wire format between the server and the browser client.
 *
 * Both halves of this package import these types, which is the only reason
 * they exist as a separate module: keeping them here means a change to a
 * payload shape is a type error on both sides at once.
 */

/** Where the client asks for everything. Kept out of the document namespace so
 *  a folder that really does contain `api/tree.mdx` still resolves. */
export const API_PREFIX = '/__mdxstudio';

/** One document in the tree. `path` is always POSIX-relative to the root. */
export interface DocEntry {
  path: string;
  /** Frontmatter `title`, else the first `#` heading, else the file name. */
  title: string;
  /** Milliseconds. Doubles as the cache key for the title extraction. */
  mtimeMs: number;
  size: number;
}

export interface TreeResponse {
  /** What to show as the collection's name - the folder's basename, or `stdin`. */
  label: string;
  /** Absolute path of the served folder. Display only. */
  root: string;
  docs: DocEntry[];
  /** `true` for `mdxstudio open -`: one document, no folder behind it. */
  single: boolean;
}

export interface DocResponse {
  path: string;
  content: string;
  mtimeMs: number;
}

/** Pushed over SSE. `paths` is empty when only the set of files changed. */
export interface ChangeEvent {
  type: 'change';
  /** Documents whose contents may have changed. */
  paths: string[];
  /** The tree itself changed - a file was added, deleted or renamed. */
  tree: boolean;
}

/** Inlined into the shell so the first paint needs no round trip for settings. */
export interface BootData {
  /** Initial document, from the request URL. Empty means "pick the first one". */
  path: string;
  label: string;
  root: string;
  single: boolean;
  watch: boolean;
  expressions: 'full' | 'literals';
  collapsibleHeadings: boolean;
  theme: string;
  /** `--theme` was passed, so it overrides whatever the browser remembered. */
  themePinned: boolean;
  version: string;
  /**
   * The config file found in the served folder, relative to it, or `null`.
   * The client imports it from there before it renders anything.
   */
  configFile: string | null;
}
