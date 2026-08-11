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
  expressions: MdxExpressionMode;
  showFrontmatterHeader: boolean;
  /** Whether the webview should report its scroll position back to the editor. */
  scrollEditorWithPreview: boolean;
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
  /** Re-run the render from scratch, dropping any cached diagram output. */
  | { type: 'refresh' };

export type WebviewMessage =
  /** Sent once the React root is mounted and ready for a `render`. */
  | { type: 'ready' }
  /** The preview was scrolled; `line` is the source line now at the top. */
  | { type: 'scroll'; line: number; revision: number }
  /** A relative link was clicked. `href` is verbatim from the document. */
  | { type: 'openLink'; href: string }
  /** Something threw outside React's error boundary. */
  | { type: 'error'; message: string };
