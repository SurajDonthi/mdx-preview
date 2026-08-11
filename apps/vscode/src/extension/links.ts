/**
 * Working out what a link in the document points at.
 *
 * Kept free of `vscode` so the path arithmetic - the part that is easy to get
 * wrong and impossible to eyeball - can be tested. The caller turns the string
 * this produces back into a `Uri` with `base.with({ path })`.
 *
 * Everything is done in `Uri.path` space, which is posix-shaped even on
 * Windows (`/D:/repo/docs/guide.mdx`), so there is exactly one separator to
 * reason about.
 */

/** `scheme:` at the start - `https:`, `mailto:`, `vscode:`. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

const MARKDOWN_EXTENSIONS = /\.(mdx|md|markdown|mdown|mkd)$/i;

export interface ParsedLink {
  /** The path part, with the `#fragment` taken off. May be empty. */
  path: string;
  /** The `#fragment`, without the hash. Empty when there was none. */
  fragment: string;
}

/** Splits `./other.mdx#a-heading` into its two halves. */
export function splitFragment(href: string): ParsedLink {
  const index = href.indexOf('#');
  if (index < 0) return { path: href, fragment: '' };
  return { path: href.slice(0, index), fragment: decodeFragment(href.slice(index + 1)) };
}

/** True for a link the *browser* owns: `https://`, `mailto:`, protocol-relative. */
export function isExternalLink(href: string): boolean {
  return ABSOLUTE.test(href) || href.startsWith('//');
}

/** True when the target is something this renderer can show in the preview. */
export function isMarkdownPath(path: string): boolean {
  return MARKDOWN_EXTENSIONS.test(path);
}

/**
 * Resolves a document-relative href to an absolute `Uri.path`.
 *
 * A leading `/` means the workspace folder, not the disk root - the same
 * convention the webview's `resolveResource` uses for images, and the one every
 * static site generator uses. Without a workspace folder it falls back to the
 * document's own directory, which is the best guess available.
 *
 * Returns `null` for anything that is not a relative path, so the caller never
 * has to re-check for `https://`.
 */
export function resolveLinkPath(
  href: string,
  documentPath: string,
  workspacePath: string | null
): string | null {
  if (href === '' || isExternalLink(href)) return null;

  const decoded = decodePath(href);
  const documentDirectory = dirname(documentPath);

  if (decoded.startsWith('/')) {
    const root = workspacePath ?? documentDirectory;
    return normalisePath(`${trimTrailingSlash(root)}/${decoded.slice(1)}`);
  }

  return normalisePath(`${trimTrailingSlash(documentDirectory)}/${decoded}`);
}

/** Everything up to the last `/`, with no trailing slash. Root stays `/`. */
export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  if (index <= 0) return '/';
  return path.slice(0, index);
}

/** Resolves `.` and `..` segments. A `..` past the root is dropped, not honoured. */
export function normalisePath(path: string): string {
  const absolute = path.startsWith('/');
  const output: string[] = [];

  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      output.pop();
      continue;
    }
    output.push(segment);
  }

  return (absolute ? '/' : '') + output.join('/');
}

function trimTrailingSlash(path: string): string {
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
}

/**
 * `%20` in an href is a space in a file name. A malformed escape is left alone
 * rather than throwing: a link that cannot be decoded is still a link that can
 * be looked up verbatim.
 */
function decodePath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeFragment(value: string): string {
  return decodePath(value);
}
