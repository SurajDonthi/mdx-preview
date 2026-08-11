/**
 * Resolving what the document points at.
 *
 * A webview cannot load `./diagram.png` from disk: every local file has to go
 * through `webview.asWebviewUri()`, which the extension host does for the
 * document's own directory and hands over as `baseUri`. So `<img src>` and
 * `<a href>` are re-registered here, and because `MdxRenderer` spreads
 * `registry.components` *after* its own element overrides, registering `img`
 * and `a` replaces the built-in ones rather than fighting them.
 */

import React, { createContext, useContext } from 'react';
import { defineMdxPlugin } from '@mdxstudio/core';

import { post } from './vscodeApi';

export interface DocumentBase {
  /** `asWebviewUri()` of the document's folder, with a trailing slash. */
  baseUri: string;
  /** Same for the workspace folder, which is what a leading `/` means. */
  workspaceUri: string | null;
}

const DocumentBaseContext = createContext<DocumentBase>({ baseUri: '', workspaceUri: null });

export function DocumentBaseProvider({
  value,
  children,
}: {
  value: DocumentBase;
  children: React.ReactNode;
}) {
  return <DocumentBaseContext.Provider value={value}>{children}</DocumentBaseContext.Provider>;
}

/** `scheme:` at the start - `https:`, `data:`, `mailto:`, `vscode:`. */
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;
const JAVASCRIPT_URL = /^\s*javascript:/i;

function isExternal(href: string): boolean {
  return ABSOLUTE.test(href) || href.startsWith('//');
}

/** Turns a document-relative path into something the webview may load. */
export function resolveResource(source: string, base: DocumentBase): string | undefined {
  if (typeof source !== 'string' || source === '') return undefined;
  if (JAVASCRIPT_URL.test(source)) return undefined;
  if (isExternal(source) || source.startsWith('#')) return source;

  const root = source.startsWith('/')
    ? base.workspaceUri ?? base.baseUri
    : base.baseUri;
  if (!root) return source;

  try {
    return new URL(source.replace(/^\//, ''), root).toString();
  } catch {
    return source;
  }
}

// `node` is the hast node MdxRenderer passes through (`passNode: true`); it is
// dropped rather than spread, or React would try to set it as a DOM attribute.
function MdxImage({ src, alt, title, node, ...rest }: Record<string, unknown>) {
  const base = useContext(DocumentBaseContext);
  void node;
  const raw = String(src ?? '');
  const resolved = resolveResource(raw, base);
  if (!resolved) return null;

  // The `vscode-resource` URL above means nothing outside the editor, and the
  // webview cannot read it back to inline it (no `connect-src` in its CSP). The
  // document's own path is kept alongside so `Export to HTML` can hand it to the
  // extension host, which *can* read the file. See `exportDom.ts`.
  const original = isExternal(raw) || raw.startsWith('data:') ? undefined : raw;

  return (
    <img
      {...(rest as Record<string, unknown>)}
      src={resolved}
      data-mdxstudio-src={original}
      alt={typeof alt === 'string' ? alt : ''}
      title={typeof title === 'string' ? title : undefined}
      className="mdxstudio-vscode-image"
    />
  );
}

function MdxLink({ href, children }: { href?: unknown; children?: React.ReactNode }) {
  const base = useContext(DocumentBaseContext);
  const raw = typeof href === 'string' ? href : '';

  if (JAVASCRIPT_URL.test(raw)) {
    return <span className="mdxstudio-link">{children}</span>;
  }

  // In-page: the renderer stamps heading ids, so this is a real target.
  if (raw.startsWith('#')) {
    return (
      <a
        href={raw}
        className="mdxstudio-link"
        onClick={(event) => {
          event.preventDefault();
          const target = document.getElementById(decodeURIComponent(raw.slice(1)));
          target?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }}
      >
        {children}
      </a>
    );
  }

  // Off to the web. VS Code opens `target="_blank"` in the real browser.
  if (isExternal(raw)) {
    return (
      <a href={raw} target="_blank" rel="noopener noreferrer" className="mdxstudio-link">
        {children}
      </a>
    );
  }

  // Another file in the repository: the extension host opens it in an editor.
  return (
    <a
      href={resolveResource(raw, base) ?? raw}
      className="mdxstudio-link"
      title={`Open ${raw}`}
      onClick={(event) => {
        event.preventDefault();
        post({ type: 'openLink', href: raw });
      }}
    >
      {children}
    </a>
  );
}

/**
 * Registered last, so these two win over `MdxRenderer`'s own `a` and the
 * default `img`.
 */
export const vscodeHostPlugin = defineMdxPlugin({
  name: '@mdxstudio/vscode',
  components: {
    img: MdxImage,
    a: MdxLink,
  },
});
