import * as vscode from 'vscode';
import type { MdxExpressionMode } from '@mdxstudio/core';

import { buildContentSecurityPolicy } from './policy';

/**
 * The preview document.
 *
 * A VS Code webview enforces exactly the policy its meta tag declares - there
 * is no outer header to fight with - and a document's CSP is fixed once it has
 * loaded. So the whole page is rebuilt whenever the policy changes, which is
 * what `MdxPreview.reload()` is for. `policy.ts` decides *what* the policy is
 * and explains why; this file only stamps it out.
 *
 * The user's own stylesheet is a second `<link>`, after the shipped one so it
 * wins the cascade and can override the `--mdxstudio-*` variables. It goes
 * through `asWebviewUri` like everything else, so `style-src webview.cspSource`
 * already covers it - no part of the policy is loosened to make it work.
 */
export interface PreviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  /** The *effective* expression mode. See `resolveExpressionMode`. */
  expressions: MdxExpressionMode;
  title: string;
  /** The user's `mdxstudio.customCss` file, already resolved to disk, or null. */
  customCssUri: vscode.Uri | null;
  /**
   * Bumped whenever the page is rebuilt. Appended to the stylesheet URLs so a
   * custom stylesheet that changed on disk is actually re-read rather than
   * served out of the webview's cache.
   */
  cacheBust: number;
}

export function buildPreviewHtml(options: PreviewHtmlOptions): string {
  const { webview, extensionUri } = options;
  const nonce = createNonce();

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'main.css')
  );
  const customCssUri = options.customCssUri
    ? webview.asWebviewUri(options.customCssUri)
    : null;

  const csp = buildContentSecurityPolicy({
    nonce,
    cspSource: webview.cspSource,
    expressions: options.expressions,
  });

  const customCssLink = customCssUri
    ? `\n<link href="${customCssUri.toString()}?v=${options.cacheBust}" rel="stylesheet">`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${styleUri}" rel="stylesheet">${customCssLink}
<title>${escapeHtml(options.title)}</title>
</head>
<body class="mdxstudio-vscode-body">
<div id="mdxstudio-preview-root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index++) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
