import { describe, expect, it } from 'vitest';

import { buildExportDocument, inlineAssets } from '../src/extension/exportHtml';
import { assetToken } from '../src/shared/protocol';

/*
 * `MDX Studio: Export to HTML`. The webview serialises its own DOM (which only
 * a real webview can do); what is testable is the assembly around it - and
 * specifically the asset substitution, because getting that wrong produces a
 * file that looks right until an image is missing from it.
 */

describe('inlineAssets', () => {
  it('replaces each token with its resolved source', () => {
    const html = `<img src="${assetToken(0)}"><img src="${assetToken(1)}">`;
    expect(inlineAssets(html, ['data:image/png;base64,AAA', 'https://x/y.png'])).toBe(
      '<img src="data:image/png;base64,AAA"><img src="https://x/y.png">'
    );
  });

  it('replaces every occurrence of the same image', () => {
    const html = `<img src="${assetToken(0)}"><img src="${assetToken(0)}">`;
    expect(inlineAssets(html, ['data:x'])).toBe('<img src="data:x"><img src="data:x">');
  });

  it('escapes what it puts into the attribute', () => {
    const html = `<img src="${assetToken(0)}">`;
    expect(inlineAssets(html, ['./a&b".png'])).toBe('<img src="./a&amp;b&quot;.png">');
  });

  it('leaves markup with no tokens exactly as it was', () => {
    expect(inlineAssets('<p>mdxstudio-asset</p>', ['data:x'])).toBe(
      '<p>mdxstudio-asset</p>'
    );
  });

  it('is not confused by tokens numbered above nine', () => {
    // `mdxstudio-asset-1` is a prefix of `mdxstudio-asset-12`, so a naive
    // ascending replace would corrupt the second one. Exact tokens, exact match.
    const html = `<img src="${assetToken(1)}"><img src="${assetToken(12)}">`;
    const assets = Array.from({ length: 13 }, (_, index) => `image-${index}.png`);
    expect(inlineAssets(html, assets)).toBe(
      '<img src="image-1.png"><img src="image-12.png">'
    );
  });
});

describe('buildExportDocument', () => {
  const options = {
    title: 'guide.mdx',
    bodyHtml: `<div class="mdxstudio-root" style="--mdxstudio-fg: var(--vscode-editor-foreground)"><img src="${assetToken(0)}"></div>`,
    rootCss: '  --vscode-editor-foreground: #cccccc;',
    styleSheet: '.mdxstudio-root { color: var(--mdxstudio-fg); }',
    assets: ['data:image/png;base64,AAA'],
  };

  it('stands on its own: no link, no script, no remote reference', () => {
    const html = buildExportDocument(options);

    expect(html).not.toMatch(/<link\b/);
    expect(html).not.toMatch(/<script\b/);
    expect(html).not.toContain('vscode-resource');
    expect(html).not.toContain(assetToken(0));
  });

  it('carries the stylesheet and the theme variables the markup refers to', () => {
    const html = buildExportDocument(options);

    expect(html).toContain('.mdxstudio-root { color: var(--mdxstudio-fg); }');
    expect(html).toContain('--vscode-editor-foreground: #cccccc;');
    // The variables have to be on :root, because the markup's inline styles
    // point at them from further down the tree.
    expect(html.indexOf(':root {')).toBeLessThan(
      html.indexOf('--vscode-editor-foreground: #cccccc;')
    );
  });

  it('escapes the title rather than letting it close a tag', () => {
    const html = buildExportDocument({ ...options, title: '<script>x</script>.mdx' });
    expect(html).toContain('<title>&lt;script&gt;x&lt;/script&gt;.mdx</title>');
    expect(html).not.toMatch(/<script\b/);
  });

  it('is a complete document', () => {
    const html = buildExportDocument(options);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('<meta charset="UTF-8">');
  });
});
