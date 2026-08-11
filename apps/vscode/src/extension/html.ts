import * as vscode from 'vscode';
import type { MdxExpressionMode } from '@mdxstudio/core';

/**
 * The preview document.
 *
 * ## Why the CSP is the interesting part
 *
 * A VS Code webview enforces exactly the policy this meta tag declares - there
 * is no outer header to fight with - so everything the renderer needs has to be
 * granted here or it silently does nothing.
 *
 * `@mdxstudio/core`'s full expression evaluator serialises each `{...}` back to
 * JavaScript and runs it through `new Function`. That is `unsafe-eval`, and
 * without it every expression in the document fails with
 * "call to Function() blocked by CSP" - the renderer reports it as a diagnostic
 * and drops the value, so the page renders but the expression-valued props
 * (`<FlowGraph data={{...}}>`) come out undefined.
 *
 * So the policy is derived from the `mdxstudio.expressions` setting:
 *
 * - `full`     -> `'unsafe-eval'` is granted. This is the default: the documents
 *                 being previewed are the user's own files, already trusted
 *                 enough that VS Code runs their tasks and their extensions.
 * - `literals` -> `'unsafe-eval'` is *not* granted, and the renderer is told to
 *                 use the non-evaluating literal walker, which needs no eval.
 *                 Component props still work; body expressions do not.
 *
 * Everything else is deliberately narrow: `default-src 'none'`, no `connect-src`
 * (the preview never talks to the network), and scripts must carry the nonce.
 */
export interface PreviewHtmlOptions {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  expressions: MdxExpressionMode;
  title: string;
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

  // `'unsafe-eval'` is the whole reason this is computed rather than constant.
  const scriptSrc = options.expressions === 'full'
    ? `'nonce-${nonce}' 'unsafe-eval'`
    : `'nonce-${nonce}'`;

  const csp = [
    `default-src 'none'`,
    // Mermaid and the flow graph draw inline SVG; images come from the document's
    // own folder (through asWebviewUri), from data: URIs, or from the web.
    `img-src ${webview.cspSource} https: data: blob:`,
    `media-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource} https: data:`,
    // `'unsafe-inline'` covers the style *attribute*: MdxRenderer stamps the
    // theme's custom properties onto its root as an inline style, and Recharts
    // and Mermaid position everything with inline styles too.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${scriptSrc}`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${styleUri}" rel="stylesheet">
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
