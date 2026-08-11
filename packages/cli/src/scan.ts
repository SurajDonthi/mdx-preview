import { open, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { IgnoreStack } from './gitignore';
import type { DocEntry } from './protocol';

/** What counts as a document. `.md` is included: plain markdown is valid MDX. */
export const DOC_EXTENSIONS = ['.mdx', '.md'] as const;

/**
 * Never walked, whatever `.gitignore` says. `node_modules` is the expensive one
 * - a single `npm install` puts tens of thousands of markdown files on disk -
 * and the rest are version-control and build directories no one reads docs from.
 */
export const ALWAYS_SKIP = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  '.cache',
  '.next',
  '.turbo',
  '.vercel',
]);

/** Enough of a file to find a frontmatter title or the first heading. */
const TITLE_PROBE_BYTES = 4096;

/** Past this many documents the sidebar is a search problem, not a labelling
 *  one, so stop paying an open() per file for prettier titles. */
const TITLE_PROBE_LIMIT = 400;

export function isDocument(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return (DOC_EXTENSIONS as readonly string[]).includes(extension);
}

export function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/**
 * Frontmatter `title`, else the first `#` heading, else `fallback`.
 *
 * Deliberately a regex over the head of the file and not a parse: this runs
 * once per document at start-up, and a sidebar label does not justify building
 * an AST for every file in a repository.
 */
export function titleFromContent(head: string, fallback: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(head);
  if (frontmatter) {
    const title = /^title\s*:\s*(.+)$/m.exec(frontmatter[1]);
    if (title) {
      const value = title[1].trim().replace(/^['"]|['"]$/g, '').trim();
      if (value) return value;
    }
  }

  const heading = /^#\s+(.+)$/m.exec(head);
  if (heading) return heading[1].trim().replace(/\s*#*\s*$/, '');

  return fallback;
}

/** Reads at most `TITLE_PROBE_BYTES` rather than the whole document. */
async function probeTitle(absolute: string, fallback: string): Promise<string> {
  let handle;
  try {
    handle = await open(absolute, 'r');
    const buffer = Buffer.alloc(TITLE_PROBE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, TITLE_PROBE_BYTES, 0);
    return titleFromContent(buffer.subarray(0, bytesRead).toString('utf8'), fallback);
  } catch {
    return fallback;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** `getting-started.mdx` -> `Getting started`. */
export function titleFromFilename(filePath: string): string {
  const base = path.basename(filePath, path.extname(filePath));
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!words) return base;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Keeps a title alive across rescans while the file's mtime is unchanged. */
type TitleCache = Map<string, { mtimeMs: number; title: string }>;

export interface ScanOptions {
  /** Default `true`. */
  respectGitignore?: boolean;
  cache?: TitleCache;
}

/**
 * Walks `root` for documents, breadth-first per directory, skipping ignored
 * and always-skipped directories without descending into them.
 *
 * Directory symlinks are not followed: a docs folder that links to its own
 * parent is not worth the cycle detection.
 */
export async function scanDocs(root: string, options: ScanOptions = {}): Promise<DocEntry[]> {
  const respectGitignore = options.respectGitignore !== false;
  const cache: TitleCache = options.cache ?? new Map();
  const found: { absolute: string; relative: string; mtimeMs: number; size: number }[] = [];

  async function walk(directory: string, relative: string, ignores: IgnoreStack): Promise<void> {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      // An unreadable directory is a fact about the machine, not an error the
      // reader can act on. Skip it and keep the rest of the tree.
      return;
    }

    let scoped = ignores;
    if (respectGitignore && entries.some((entry) => entry.isFile() && entry.name === '.gitignore')) {
      try {
        scoped = ignores.with(relative, await readFile(path.join(directory, '.gitignore'), 'utf8'));
      } catch {
        // keep the outer stack
      }
    }

    const directories: { name: string; relative: string }[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') {
        // Dotfiles are not documentation, and `.github/` is templates.
        continue;
      }
      if (ALWAYS_SKIP.has(entry.name)) continue;

      const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
      const isDirectory = entry.isDirectory();

      if (entry.isSymbolicLink()) continue;
      if (scoped.ignores(childRelative, isDirectory)) continue;

      if (isDirectory) {
        directories.push({ name: entry.name, relative: childRelative });
        continue;
      }
      if (!entry.isFile() || !isDocument(entry.name)) continue;

      const absolute = path.join(directory, entry.name);
      try {
        const stats = await stat(absolute);
        found.push({ absolute, relative: childRelative, mtimeMs: stats.mtimeMs, size: stats.size });
      } catch {
        // vanished between readdir and stat
      }
    }

    for (const child of directories) {
      await walk(path.join(directory, child.name), child.relative, scoped);
    }
  }

  await walk(root, '', IgnoreStack.empty());

  const probeTitles = found.length <= TITLE_PROBE_LIMIT;

  const docs = await Promise.all(
    found.map(async (file): Promise<DocEntry> => {
      const fallback = titleFromFilename(file.relative);
      const cached = cache.get(file.relative);
      if (cached && cached.mtimeMs === file.mtimeMs) {
        return { path: file.relative, title: cached.title, mtimeMs: file.mtimeMs, size: file.size };
      }

      const title = probeTitles ? await probeTitle(file.absolute, fallback) : fallback;
      cache.set(file.relative, { mtimeMs: file.mtimeMs, title });
      return { path: file.relative, title, mtimeMs: file.mtimeMs, size: file.size };
    })
  );

  return sortDocs(docs);
}

/**
 * Shallow paths first, then `index`/`README` ahead of their siblings, then
 * alphabetical. That is the order a reader expects a documentation tree in.
 */
export function sortDocs(docs: DocEntry[]): DocEntry[] {
  const rank = (docPath: string): number => {
    const base = path.basename(docPath).toLowerCase();
    if (base.startsWith('index.')) return 0;
    if (base.startsWith('readme.')) return 1;
    return 2;
  };

  return [...docs].sort((left, right) => {
    const leftDir = path.posix.dirname(left.path);
    const rightDir = path.posix.dirname(right.path);
    if (leftDir !== rightDir) return leftDir.localeCompare(rightDir, undefined, { numeric: true });
    const byRank = rank(left.path) - rank(right.path);
    if (byRank !== 0) return byRank;
    return left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: 'base' });
  });
}
