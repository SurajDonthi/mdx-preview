import { describe, expect, it } from 'vitest';

import {
  isExternalLink,
  isMarkdownPath,
  normalisePath,
  resolveLinkPath,
  splitFragment,
} from '../src/extension/links';

/*
 * Following `[see](./other.mdx#a-heading)`. All of it is path arithmetic in
 * `Uri.path` space, which on Windows still looks like `/D:/repo/docs/x.mdx`.
 */

const DOCUMENT = '/D:/repo/docs/guide.mdx';
const WORKSPACE = '/D:/repo';

describe('splitFragment', () => {
  it('separates the anchor', () => {
    expect(splitFragment('./other.mdx#a-heading')).toEqual({
      path: './other.mdx',
      fragment: 'a-heading',
    });
  });

  it('copes with no anchor and with an anchor alone', () => {
    expect(splitFragment('./other.mdx')).toEqual({ path: './other.mdx', fragment: '' });
    expect(splitFragment('#a-heading')).toEqual({ path: '', fragment: 'a-heading' });
  });

  it('decodes an escaped anchor', () => {
    expect(splitFragment('./a.mdx#why%20not').fragment).toBe('why not');
  });
});

describe('isExternalLink', () => {
  it('recognises what the browser owns', () => {
    expect(isExternalLink('https://example.com')).toBe(true);
    expect(isExternalLink('mailto:a@b.c')).toBe(true);
    expect(isExternalLink('vscode://x')).toBe(true);
    expect(isExternalLink('//example.com/a')).toBe(true);
  });

  it('leaves relative paths alone', () => {
    expect(isExternalLink('./other.mdx')).toBe(false);
    expect(isExternalLink('/docs/other.md')).toBe(false);
    expect(isExternalLink('other.mdx')).toBe(false);
  });
});

describe('isMarkdownPath', () => {
  it('covers every extension the preview renders', () => {
    for (const path of ['a.mdx', 'a.md', 'a.markdown', 'a.mdown', 'a.mkd', 'A.MDX']) {
      expect(isMarkdownPath(path)).toBe(true);
    }
  });

  it('excludes everything else', () => {
    for (const path of ['a.png', 'a.ts', 'a.mdx.bak', 'mdx', 'a.html']) {
      expect(isMarkdownPath(path)).toBe(false);
    }
  });
});

describe('resolveLinkPath', () => {
  it('resolves against the document, not the workspace', () => {
    expect(resolveLinkPath('./other.mdx', DOCUMENT, WORKSPACE)).toBe('/D:/repo/docs/other.mdx');
    expect(resolveLinkPath('other.mdx', DOCUMENT, WORKSPACE)).toBe('/D:/repo/docs/other.mdx');
    expect(resolveLinkPath('nested/deep.md', DOCUMENT, WORKSPACE)).toBe(
      '/D:/repo/docs/nested/deep.md'
    );
  });

  it('walks up out of the document folder', () => {
    expect(resolveLinkPath('../README.md', DOCUMENT, WORKSPACE)).toBe('/D:/repo/README.md');
    // Two levels up from `/D:/repo/docs` is the drive, not the disk root: on
    // Windows the drive letter is a path segment like any other.
    expect(resolveLinkPath('../../elsewhere.md', DOCUMENT, WORKSPACE)).toBe(
      '/D:/elsewhere.md'
    );
  });

  it('reads a leading slash as the workspace folder, not the disk root', () => {
    expect(resolveLinkPath('/docs/other.mdx', DOCUMENT, WORKSPACE)).toBe(
      '/D:/repo/docs/other.mdx'
    );
  });

  it('falls back to the document folder with no workspace open', () => {
    expect(resolveLinkPath('/other.mdx', DOCUMENT, null)).toBe('/D:/repo/docs/other.mdx');
  });

  it('decodes an escaped path', () => {
    expect(resolveLinkPath('./my%20notes.md', DOCUMENT, WORKSPACE)).toBe(
      '/D:/repo/docs/my notes.md'
    );
  });

  it('has nothing to say about anything absolute', () => {
    expect(resolveLinkPath('https://example.com/a.md', DOCUMENT, WORKSPACE)).toBeNull();
    expect(resolveLinkPath('mailto:a@b.c', DOCUMENT, WORKSPACE)).toBeNull();
    expect(resolveLinkPath('', DOCUMENT, WORKSPACE)).toBeNull();
  });
});

describe('normalisePath', () => {
  it('drops the segments that mean nothing', () => {
    expect(normalisePath('/a/./b//c')).toBe('/a/b/c');
    expect(normalisePath('/a/b/../c')).toBe('/a/c');
  });

  it('refuses to escape above the root', () => {
    expect(normalisePath('/../../etc/passwd')).toBe('/etc/passwd');
  });
});
