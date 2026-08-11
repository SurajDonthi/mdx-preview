import { watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';

import { ALWAYS_SKIP, isDocument, toPosix } from './scan';

export interface WatchHandle {
  close(): void;
  /** `'native'` when the OS reports changes, `'poll'` on platforms that cannot. */
  readonly mode: 'native' | 'poll';
}

export interface WatchOptions {
  /** Milliseconds to coalesce a burst of events. An editor's save is several. */
  debounceMs?: number;
  /** Poll interval for the fallback. */
  pollMs?: number;
  /** Paths already known, POSIX-relative. Used only by the polling fallback. */
  known?: () => string[];
}

/**
 * Watches `root` for document changes.
 *
 * `fs.watch` with `recursive: true` is used where the platform supports it -
 * Windows and macOS always, Linux since Node 20 - because it is one OS-level
 * subscription rather than a descriptor per directory. Where it is not
 * available the fallback stats the documents the scanner already found, which
 * catches edits and deletions; additions arrive on the next explicit rescan.
 *
 * No dependency on chokidar: this package's whole point is that
 * `npx @mdxstudio/cli` downloads one small tarball.
 */
export function watchDocuments(
  root: string,
  onChange: (changed: string[]) => void,
  options: WatchOptions = {}
): WatchHandle {
  const debounceMs = options.debounceMs ?? 90;
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;

  const flush = (): void => {
    timer = null;
    if (pending.size === 0) return;
    const changed = [...pending];
    pending.clear();
    onChange(changed);
  };

  const queue = (relative: string): void => {
    pending.add(relative);
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  };

  const interesting = (relative: string): boolean => {
    if (relative === '') return false;
    const segments = relative.split('/');
    if (segments.some((segment) => ALWAYS_SKIP.has(segment))) return false;
    // A rename shows up as a change to the directory, which is how additions
    // and deletions are noticed; only documents and directories matter.
    return isDocument(relative) || !path.extname(relative);
  };

  try {
    const watcher = watch(root, { recursive: true, persistent: true }, (_event, filename) => {
      if (!filename) {
        queue('');
        return;
      }
      const relative = toPosix(filename.toString());
      if (!interesting(relative)) return;
      queue(relative);
    });

    watcher.on('error', () => {
      // A watcher that dies mid-run must not take the server with it; the
      // reader can still refresh by hand.
    });

    return {
      mode: 'native',
      close(): void {
        if (timer) clearTimeout(timer);
        watcher.close();
      },
    };
  } catch {
    // ERR_FEATURE_UNAVAILABLE_ON_PLATFORM, or a root that cannot be watched.
  }

  const pollMs = options.pollMs ?? 1000;
  const seen = new Map<string, number>();
  let stopped = false;

  const poll = async (): Promise<void> => {
    if (stopped) return;
    const paths = options.known?.() ?? [];
    for (const relative of paths) {
      let mtimeMs: number;
      try {
        mtimeMs = (await stat(path.join(root, relative))).mtimeMs;
      } catch {
        if (seen.delete(relative)) queue(relative);
        continue;
      }
      const previous = seen.get(relative);
      seen.set(relative, mtimeMs);
      if (previous !== undefined && previous !== mtimeMs) queue(relative);
    }
  };

  void poll();
  const interval = setInterval(() => void poll(), pollMs);

  return {
    mode: 'poll',
    close(): void {
      stopped = true;
      clearInterval(interval);
      if (timer) clearTimeout(timer);
    },
  };
}
