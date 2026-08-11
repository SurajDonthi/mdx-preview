/**
 * Assembling the standalone `.html` file.
 *
 * The preview is the only thing that knows what the document actually became -
 * Mermaid has resolved, the flow graph has measured itself, Recharts has drawn
 * its SVG - so the markup is serialised in the webview and shipped over. This
 * module is the other half: it wraps that markup in a document that stands on
 * its own in any browser, with no VS Code and no network.
 *
 * Three things have to come with it or the file is a pile of unstyled text:
 *
 * 1. **The stylesheet.** `dist/webview/main.css`, read off disk and inlined.
 *    esbuild has already turned every font and icon it references into a
 *    `data:` URI, so inlining the text is enough to make it self-contained.
 * 2. **The theme's own variables.** The renderer stamps `--mdxstudio-*` onto its
 *    root as an inline style, but in the preview those point at `--vscode-*`
 *    custom properties that only exist inside the editor. The webview dumps the
 *    resolved `--vscode-*` block and it is re-declared on `:root` here.
 * 3. **The images.** Local ones are read off disk and become `data:` URIs; the
 *    webview left a token in their place because a webview cannot fetch its own
 *    resources back (there is no `connect-src` in its CSP, deliberately).
 *
 * Pure, so `tests/exportHtml.test.ts` can pin the substitution down.
 */

import { ASSET_TOKEN_PREFIX } from '../shared/protocol';

/** Matches one whole token, so `-1` is never mistaken for the start of `-12`. */
const ASSET_TOKEN = new RegExp(`${ASSET_TOKEN_PREFIX}(\\d+)`, 'g');

export interface ExportDocumentOptions {
  /** Becomes the `<title>`; usually the source file's name. */
  title: string;
  /** `outerHTML` of the renderer's root, with {@link assetToken} in image `src`s. */
  bodyHtml: string;
  /** `--vscode-*: value;` declarations, resolved by the webview. */
  rootCss: string;
  /** The whole of `dist/webview/main.css`. */
  styleSheet: string;
  /** Resolved `data:` URI (or original href) for each asset token, by index. */
  assets: readonly string[];
}

export function buildExportDocument(options: ExportDocumentOptions): string {
  const body = inlineAssets(options.bodyHtml, options.assets);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="MDX Studio">
<title>${escapeHtml(options.title)}</title>
<style>
:root {
${options.rootCss}
}
html, body {
  margin: 0;
  padding: 0;
  min-height: 100%;
  background-color: var(--vscode-editor-background, #ffffff);
  color: var(--vscode-editor-foreground, #1f2328);
}
/* The renderer's own root sizes everything in rem against a 16px base, exactly
   as the preview's shell sheet arranges. */
#mdxstudio-export-root {
  font-size: 1rem;
}
${options.styleSheet}
</style>
</head>
<body>
<div id="mdxstudio-export-root">
${body}
</div>
</body>
</html>`;
}

/**
 * Puts the real image sources back.
 *
 * One pass over the whole string rather than one pass per asset: `…-asset-1` is
 * a prefix of `…-asset-12`, so replacing them in turn would rewrite the tail of
 * the twelfth image's token and leave a `2` stranded in the markup. Matching the
 * index as a whole number is the only form of this that is right for a document
 * with more than ten images in it.
 *
 * The token is `[a-z0-9-]` only, so it survives HTML attribute escaping
 * untouched - which is the whole reason the webview substitutes a token rather
 * than leaving the original path in place.
 */
export function inlineAssets(html: string, assets: readonly string[]): string {
  // `lastIndex` on a shared global regex is state; resetting it keeps repeated
  // exports from starting halfway through the markup.
  ASSET_TOKEN.lastIndex = 0;

  return html.replace(ASSET_TOKEN, (whole, digits: string) => {
    const asset = assets[Number(digits)];
    return asset === undefined ? whole : escapeAttribute(asset);
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
