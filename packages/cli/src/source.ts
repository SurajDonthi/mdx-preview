import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import type { DocEntry } from './protocol';
import { isDocument, scanDocs, titleFromContent } from './scan';
import { watchDocuments } from './watch';
import type { WatchHandle } from './watch';

export interface DocContent {
  content: string;
  mtimeMs: number;
}

/**
 * Where documents come from. `serve` reads a folder and `open -` reads stdin;
 * the HTTP layer is written against this interface so it never learns which.
 */
export interface DocSource {
  /** Shown as the collection name in the sidebar. */
  readonly label: string;
  /** Absolute path, for the banner the CLI prints. */
  readonly root: string;
  /** One document with no folder behind it. */
  readonly single: boolean;
  list(): Promise<DocEntry[]>;
  read(docPath: string): Promise<DocContent | null>;
  /**
   * Absolute path of a non-document file inside the root - the images a
   * document links to relatively. `null` when there is no such file, or when
   * the request tried to escape the root.
   */
  resolveAsset(requestPath: string): Promise<string | null>;
  watch(onChange: (changed: string[]) => void): WatchHandle | null;
}

/** Rejects `..`, absolute paths and drive letters before any fs call. */
export function safeJoin(root: string, requestPath: string): string | null {
  if (requestPath === '' || requestPath.includes('\0')) return null;
  const normalised = path.normalize(requestPath).split(path.sep).join('/');
  if (normalised.startsWith('../') || normalised === '..') return null;
  if (path.isAbsolute(normalised) || /^[a-zA-Z]:/.test(normalised)) return null;

  const absolute = path.resolve(root, normalised);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return absolute;
}

export interface DirectorySourceOptions {
  respectGitignore?: boolean;
  watch?: boolean;
}

export function createDirectorySource(root: string, options: DirectorySourceOptions = {}): DocSource {
  const absoluteRoot = path.resolve(root);
  const titleCache = new Map<string, { mtimeMs: number; title: string }>();
  let lastList: DocEntry[] = [];

  return {
    label: path.basename(absoluteRoot) || absoluteRoot,
    root: absoluteRoot,
    single: false,

    async list(): Promise<DocEntry[]> {
      lastList = await scanDocs(absoluteRoot, {
        respectGitignore: options.respectGitignore,
        cache: titleCache,
      });
      return lastList;
    },

    async read(docPath: string): Promise<DocContent | null> {
      if (!isDocument(docPath)) return null;
      const absolute = safeJoin(absoluteRoot, docPath);
      if (!absolute) return null;
      try {
        const [content, stats] = await Promise.all([readFile(absolute, 'utf8'), stat(absolute)]);
        return { content, mtimeMs: stats.mtimeMs };
      } catch {
        return null;
      }
    },

    async resolveAsset(requestPath: string): Promise<string | null> {
      const absolute = safeJoin(absoluteRoot, requestPath);
      if (!absolute) return null;
      try {
        return (await stat(absolute)).isFile() ? absolute : null;
      } catch {
        return null;
      }
    },

    watch(onChange): WatchHandle | null {
      if (options.watch === false) return null;
      return watchDocuments(absoluteRoot, onChange, {
        known: () => lastList.map((doc) => doc.path),
      });
    },
  };
}

/**
 * One document held in memory - what `mdxstudio open -` serves. It reuses the
 * whole server rather than adding a second viewer, which is the only reason
 * the command is cheap enough to exist.
 */
export function createMemorySource(name: string, content: string): DocSource {
  const mtimeMs = Date.now();
  const title = titleFromContent(content.slice(0, 4096), name);
  const entry: DocEntry = {
    path: name,
    title,
    mtimeMs,
    size: Buffer.byteLength(content),
  };

  return {
    label: title,
    root: process.cwd(),
    single: true,
    async list(): Promise<DocEntry[]> {
      return [entry];
    },
    async read(docPath: string): Promise<DocContent | null> {
      return docPath === name ? { content, mtimeMs } : null;
    },
    async resolveAsset(): Promise<string | null> {
      return null;
    },
    watch(): WatchHandle | null {
      return null;
    },
  };
}
