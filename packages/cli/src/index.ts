/**
 * The programmatic half of `@mdxstudio/cli`.
 *
 * Everything the `mdxstudio` command does is available here, so a tool that
 * wants a browsable documentation server - a test harness, an editor
 * extension, another CLI - can have one without spawning a process.
 */

export { createDocServer, clientDirectory } from './server';
export type { DocServer, DocServerOptions } from './server';

export { createDirectorySource, createMemorySource, safeJoin } from './source';
export type { DocSource, DocContent, DirectorySourceOptions } from './source';

export {
  scanDocs,
  sortDocs,
  isDocument,
  titleFromContent,
  titleFromFilename,
  toPosix,
  DOC_EXTENSIONS,
  ALWAYS_SKIP,
} from './scan';
export type { ScanOptions } from './scan';

export { IgnoreStack, parseIgnoreFile } from './gitignore';
export type { IgnoreRule } from './gitignore';

export { watchDocuments } from './watch';
export type { WatchHandle, WatchOptions } from './watch';

export { parseArgs, UsageError, DEFAULT_PORT, HELP } from './args';
export type { CliOptions, Command } from './args';

export { renderShell } from './shell';

export { API_PREFIX } from './protocol';
export type { BootData, ChangeEvent, DocEntry, DocResponse, TreeResponse } from './protocol';
