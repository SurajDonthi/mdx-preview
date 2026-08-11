/**
 * The messages the extension host and the preview webview exchange.
 *
 * Imported by both sides, so neither can change a payload without the other's
 * typecheck noticing.
 */

import type { MdxExpressionMode } from '@mdxstudio/core';

/** Everything the webview needs to render one document. */
export interface PreviewState {
  /** `Uri.toString()` of the source document. Identity only; never fetched. */
  uri: string;
  /** Shown in the empty/error states, not in the document itself. */
  fileName: string;
  content: string;
  /**
   * `asWebviewUri()` of the directory holding the document, with a trailing
   * slash, so a relative `src`/`href` resolves against it with `new URL()`.
   */
  baseUri: string;
  /** Same, for the workspace folder the document belongs to. Resolves a leading `/`. */
  workspaceUri: string | null;
  /**
   * The mode the renderer actually runs in, after workspace trust has had its
   * say. Never higher than `mdxstudio.expressions` asks for.
   */
  expressions: MdxExpressionMode;
  /**
   * Why the preview is running with less than the setting asks for, in words,
   * or `null` when it is not. Shown as a banner: the reader has to be able to
   * tell a document that renders nothing from one that is being held back.
   */
  restriction: string | null;
  /**
   * The workspace's `mdxstudio.config.js`, as a URL the webview may import, or
   * `null` when there is none to load - including when there is one but the
   * workspace is not trusted, in which case `restriction` says so.
   *
   * A URL rather than the file's contents: the config contributes React
   * components and unified plugins, which are not values that survive a
   * `postMessage`. The webview imports it as a module, which is why the page's
   * `script-src` names `webview.cspSource` when this is set. See `policy.ts`.
   */
  configUri: string | null;
  /** The config's file name, for the message a broken one produces. */
  configFile: string | null;
  showFrontmatterHeader: boolean;
  /** Whether the webview should report its scroll position back to the editor. */
  scrollEditorWithPreview: boolean;
  /** Whether the block under the editor's cursor gets a left-edge marker. */
  highlightCurrentLine: boolean;
  /**
   * A heading id to scroll to once this render is on the page, from following a
   * `./other.mdx#some-heading` link. Consumed by the render it arrives with.
   */
  anchor: string | null;
  /**
   * Bumped on every send. The webview echoes it back with a scroll report so
   * the host can drop reports that describe a document it has already replaced.
   */
  revision: number;
}

export type HostMessage =
  /** Render this document. Same `uri` as last time means "the text changed". */
  | { type: 'render'; state: PreviewState }
  /** The editor moved; put this source line at the top of the viewport. */
  | { type: 'revealLine'; line: number }
  /** The cursor moved; mark the block this source line belongs to. */
  | { type: 'highlightLine'; line: number }
  /** Scale the rendered document. `1` is unscaled. */
  | { type: 'zoom'; level: number }
  /** Serialise the rendered DOM and send it back as an `exported` message. */
  | { type: 'export' }
  /** Re-run the render from scratch, dropping any cached diagram output. */
  | { type: 'refresh' };

export type WebviewMessage =
  /** Sent once the React root is mounted and ready for a `render`. */
  | { type: 'ready' }
  /** The preview was scrolled; `line` is the source line now at the top. */
  | { type: 'scroll'; line: number; revision: number }
  /** Ctrl/Cmd+click landed on a block that came from this source line. */
  | { type: 'revealSource'; line: number; revision: number }
  /** A relative link was clicked. `href` is verbatim from the document. */
  | { type: 'openLink'; href: string }
  /** The answer to an `export`. See `exportHtml.ts` for what the host does with it. */
  | { type: 'exported'; payload: ExportPayload }
  /** Something threw outside React's error boundary. */
  | { type: 'error'; message: string };

/** The rendered document, serialised out of the webview. */
export interface ExportPayload {
  /** `outerHTML` of the renderer's root, with image `src`s replaced by tokens. */
  html: string;
  /** The resolved `--vscode-*` declarations the markup's inline styles refer to. */
  rootCss: string;
  /**
   * The original, document-relative `src` of each image, in token order. The
   * host resolves these against the document and inlines them.
   */
  assets: string[];
}

/**
 * What a local image's `src` says in {@link ExportPayload.html} until the host
 * has read the file and can put a `data:` URI there.
 *
 * A webview cannot fetch its own resources back - its CSP has no `connect-src`,
 * deliberately - so the two sides have to agree on a placeholder. `[a-z0-9-]`
 * only, so it survives HTML attribute escaping untouched and the host's
 * substitution is an exact string replace rather than a parse.
 */
export const ASSET_TOKEN_PREFIX = 'mdxstudio-asset-';

export function assetToken(index: number): string {
  return `${ASSET_TOKEN_PREFIX}${index}`;
}
