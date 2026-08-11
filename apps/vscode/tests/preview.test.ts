import { describe, expect, it } from 'vitest';

import { lineForOffset, offsetForLine, type Anchor } from '../src/webview/anchors';
import { resolveResource, type DocumentBase } from '../src/webview/documentBase';

/*
 * The two pieces of the preview that are pure functions of their input, and the
 * two that are easy to get subtly wrong: the scroll-sync interpolation and the
 * `asWebviewUri` resolution a document's relative paths go through.
 *
 * Everything else in the extension either needs the `vscode` module (which only
 * exists inside the extension host) or a real webview, and is verified by
 * running it - see the report.
 */

const anchors: Anchor[] = [
  { line: 1, top: 0 },
  { line: 11, top: 100 },
  { line: 31, top: 500 },
  { line: 41, top: 600 },
];

describe('offsetForLine', () => {
  it('lands exactly on a heading', () => {
    expect(offsetForLine(anchors, 11)).toBe(100);
    expect(offsetForLine(anchors, 31)).toBe(500);
  });

  it('interpolates between two headings', () => {
    // Halfway from line 11 to line 31 is halfway from 100px to 500px.
    expect(offsetForLine(anchors, 21)).toBe(300);
  });

  it('clamps outside the document', () => {
    expect(offsetForLine(anchors, -5)).toBe(0);
    expect(offsetForLine(anchors, 9999)).toBe(600);
  });

  it('has nowhere to go when the document has no headings', () => {
    expect(offsetForLine([], 42)).toBe(0);
  });
});

describe('lineForOffset', () => {
  it('inverts offsetForLine at the anchors', () => {
    for (const anchor of anchors) {
      expect(lineForOffset(anchors, anchor.top)).toBe(anchor.line);
    }
  });

  it('interpolates between two headings', () => {
    expect(lineForOffset(anchors, 300)).toBe(21);
  });

  it('is monotonic, so scrolling down never moves the editor up', () => {
    let previous = -Infinity;
    for (let offset = 0; offset <= 700; offset += 17) {
      const line = lineForOffset(anchors, offset);
      expect(line).toBeGreaterThanOrEqual(previous);
      previous = line;
    }
  });
});

describe('resolveResource', () => {
  const base: DocumentBase = {
    baseUri: 'https://file+.vscode-resource.vscode-cdn.net/d%3A/repo/docs/',
    workspaceUri: 'https://file+.vscode-resource.vscode-cdn.net/d%3A/repo/',
  };

  it('resolves a path relative to the document', () => {
    expect(resolveResource('./diagram.png', base)).toBe(`${base.baseUri}diagram.png`);
    expect(resolveResource('images/x.svg', base)).toBe(`${base.baseUri}images/x.svg`);
  });

  it('resolves a leading slash against the workspace folder, not the disk root', () => {
    expect(resolveResource('/assets/logo.png', base)).toBe(
      `${base.workspaceUri}assets/logo.png`
    );
  });

  it('walks up out of the document folder', () => {
    expect(resolveResource('../assets/logo.png', base)).toBe(
      'https://file+.vscode-resource.vscode-cdn.net/d%3A/repo/assets/logo.png'
    );
  });

  it('leaves anything already absolute alone', () => {
    expect(resolveResource('https://example.com/a.png', base)).toBe(
      'https://example.com/a.png'
    );
    expect(resolveResource('data:image/png;base64,AAAA', base)).toBe(
      'data:image/png;base64,AAAA'
    );
    expect(resolveResource('//example.com/a.png', base)).toBe('//example.com/a.png');
    expect(resolveResource('#a-heading', base)).toBe('#a-heading');
  });

  it('refuses a javascript: URL', () => {
    expect(resolveResource('javascript:alert(1)', base)).toBeUndefined();
    expect(resolveResource('  JavaScript:alert(1)', base)).toBeUndefined();
  });

  it('has nothing to resolve against before the first document arrives', () => {
    expect(resolveResource('./a.png', { baseUri: '', workspaceUri: null })).toBe('./a.png');
    expect(resolveResource('', base)).toBeUndefined();
  });
});
