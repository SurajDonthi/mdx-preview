/**
 * A `.gitignore` matcher, small enough to keep this package dependency-free.
 *
 * It implements the subset of gitignore(5) that documentation folders actually
 * use: comments, blank lines, negation with `!`, directory-only patterns with a
 * trailing `/`, anchoring with a leading or embedded `/`, and the `*`, `?`,
 * `**` and `[...]` wildcards. Last matching rule wins, as in git.
 *
 * What it deliberately does not do: `.git/info/exclude`, the global excludes
 * file, or the index. Missing an ignore rule here costs one extra file in a
 * sidebar, so the trade is worth the zero dependencies.
 */

export interface IgnoreRule {
  negated: boolean;
  /** Only matches directories (the pattern ended in `/`). */
  dirOnly: boolean;
  regex: RegExp;
  source: string;
}

const REGEX_SPECIAL = /[.+^${}()|[\]\\]/;

/**
 * Translates one gitignore pattern into an anchored regular expression.
 * The path it will be tested against is relative to the file's own directory,
 * POSIX-separated, with no leading slash.
 */
function patternToRegex(pattern: string, anchored: boolean): RegExp {
  let out = anchored ? '^' : '^(?:.*/)?';

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (char === '\\') {
      const next = pattern[index + 1];
      if (next !== undefined) {
        out += REGEX_SPECIAL.test(next) ? `\\${next}` : next;
        index += 1;
      }
      continue;
    }

    if (char === '*') {
      // `**` spans directory separators; a single `*` does not.
      if (pattern[index + 1] === '*') {
        let cursor = index + 2;
        if (pattern[cursor] === '/') {
          out += '(?:.*/)?';
          cursor += 1;
        } else {
          out += '.*';
        }
        index = cursor - 1;
        continue;
      }
      out += '[^/]*';
      continue;
    }

    if (char === '?') {
      out += '[^/]';
      continue;
    }

    if (char === '[') {
      const close = pattern.indexOf(']', index + 1);
      if (close !== -1) {
        let set = pattern.slice(index + 1, close);
        if (set.startsWith('!')) set = `^${set.slice(1)}`;
        out += `[${set}]`;
        index = close;
        continue;
      }
      out += '\\[';
      continue;
    }

    out += REGEX_SPECIAL.test(char) ? `\\${char}` : char;
  }

  // A matched directory ignores everything beneath it, so the expression has to
  // accept trailing segments as well as the entry itself.
  return new RegExp(`${out}(?:/.*)?$`);
}

export function parseIgnoreFile(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    // Trailing whitespace is not part of a pattern unless it was escaped.
    let line = rawLine.replace(/(?<!\\)\s+$/, '');
    if (line === '' || line.startsWith('#')) continue;

    const source = line;
    let negated = false;
    if (line.startsWith('!')) {
      negated = true;
      line = line.slice(1);
    }
    if (line.startsWith('\\#') || line.startsWith('\\!')) line = line.slice(1);

    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    if (line === '') continue;

    // A slash anywhere but at the end anchors the pattern to this file's
    // directory; without one it matches at any depth below it.
    const anchored = line.includes('/');
    if (line.startsWith('/')) line = line.slice(1);

    rules.push({ negated, dirOnly, regex: patternToRegex(line, anchored), source });
  }

  return rules;
}

/** One `.gitignore`, plus the directory its patterns are relative to. */
interface IgnoreLayer {
  /** POSIX path from the scan root. `''` for the root's own file. */
  base: string;
  rules: IgnoreRule[];
}

/**
 * The stack of `.gitignore` files in scope for the directory being walked.
 * Layers are immutable, so a child directory just gets a longer stack and the
 * walk needs no unwinding.
 */
export class IgnoreStack {
  private constructor(private readonly layers: readonly IgnoreLayer[]) {}

  static empty(): IgnoreStack {
    return new IgnoreStack([]);
  }

  /** A new stack with this directory's `.gitignore` pushed on top. */
  with(base: string, text: string): IgnoreStack {
    const rules = parseIgnoreFile(text);
    if (rules.length === 0) return this;
    return new IgnoreStack([...this.layers, { base, rules }]);
  }

  /**
   * `path` is POSIX-relative to the scan root. The last rule to match wins, and
   * deeper `.gitignore` files are consulted after shallower ones.
   */
  ignores(path: string, isDirectory: boolean): boolean {
    let ignored = false;

    for (const layer of this.layers) {
      const relative =
        layer.base === '' ? path : path.startsWith(`${layer.base}/`) ? path.slice(layer.base.length + 1) : null;
      if (relative === null) continue;

      for (const rule of layer.rules) {
        if (rule.dirOnly && !isDirectory) continue;
        if (rule.regex.test(relative)) ignored = !rule.negated;
      }
    }

    return ignored;
  }
}
