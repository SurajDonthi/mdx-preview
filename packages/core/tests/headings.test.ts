/**
 * Heading collection is the single definition of a heading's id: the renderer
 * stamps these onto the tree it renders, the table of contents links to them and
 * the scroll-spy reads them back. If any of those three disagree the outline
 * points at anchors that are not on the page.
 *
 * `packages/react/tests/headingIds.test.tsx` holds the other half of that
 * contract - that the ids here are the ones the renderer really emits.
 */

import { describe, expect, it } from 'vitest';
import { collectHeadings, extractHeadings, parseMdxDocument, slugify } from '@mdxstudio/core';

const ids = (source: string) => extractHeadings(source).map((heading) => heading.id);
const texts = (source: string) => extractHeadings(source).map((heading) => heading.text);

describe('slugify', () => {
  it('lower-cases, strips punctuation and collapses separators', () => {
    expect(slugify('Hello, World!')).toBe('hello-world');
    expect(slugify('  Spaced   Out  ')).toBe('spaced-out');
    expect(slugify('snake_case and-dashes')).toBe('snake-case-and-dashes');
    expect(slugify('---Trimmed---')).toBe('trimmed');
  });

  it('returns an empty string when nothing survives', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('collectHeadings', () => {
  it('excludes headings inside fenced code blocks', () => {
    const source = [
      '# Real heading',
      '',
      '```bash',
      '# not a heading, a shell comment',
      'echo hi',
      '```',
      '',
      '```markdown',
      '## also not a heading',
      '```',
      '',
      '## Second real heading',
    ].join('\n');

    expect(texts(source)).toEqual(['Real heading', 'Second real heading']);
  });

  it('gives duplicate slugs stable suffixes in document order', () => {
    const source = ['# Setup', '## Setup', '### Setup', '## Other', '## Other'].join('\n\n');

    expect(ids(source)).toEqual(['setup', 'setup-1', 'setup-2', 'other', 'other-1']);
  });

  it('falls back to "heading" when the text slugifies to nothing', () => {
    const source = ['# !!!', '', '## !!!'].join('\n');
    expect(ids(source)).toEqual(['heading', 'heading-1']);
  });

  it('uses the rendered text of a heading that contains bold or code', () => {
    const source = '# The **fast** `parse` path\n';

    expect(texts(source)).toEqual(['The fast parse path']);
    expect(ids(source)).toEqual(['the-fast-parse-path']);
  });

  it('gives headings inside JSX children an id but keeps them out of the outline', () => {
    const source = [
      '# Page',
      '',
      '<Tabs>',
      '',
      '## Only mounted when its tab is active',
      '',
      '</Tabs>',
      '',
      '## On the page',
    ].join('\n');

    const { tree } = parseMdxDocument(source);
    const all = collectHeadings(tree);

    expect(all.map((heading) => heading.text)).toEqual([
      'Page',
      'Only mounted when its tab is active',
      'On the page',
    ]);
    expect(all.map((heading) => heading.insideJsx)).toEqual([false, true, false]);
    // The hidden one still gets an id, and it still consumes a slug slot, so the
    // ids of the headings around it do not shift when it is added or removed.
    expect(all.map((heading) => heading.id)).toEqual([
      'page',
      'only-mounted-when-its-tab-is-active',
      'on-the-page',
    ]);

    expect(texts(source)).toEqual(['Page', 'On the page']);
  });

  it('returns nothing for a tree that is not a tree', () => {
    expect(collectHeadings(null)).toEqual([]);
    expect(collectHeadings('# not parsed')).toEqual([]);
  });
});

describe('extractHeadings', () => {
  it('ignores headings written inside frontmatter', () => {
    const source = ['---', 'title: "# Not a heading"', '---', '', '# Real'].join('\n');

    expect(texts(source)).toEqual(['Real']);
  });

  it('stops at level 4', () => {
    const source = ['# One', '## Two', '### Three', '#### Four', '##### Five', '###### Six'].join(
      '\n\n'
    );

    expect(extractHeadings(source).map((heading) => heading.level)).toEqual([1, 2, 3, 4]);
  });

  it('keeps document order', () => {
    const source = ['## B', '# A', '### C'].join('\n\n');
    expect(texts(source)).toEqual(['B', 'A', 'C']);
  });

  it('returns nothing for a document that does not parse', () => {
    expect(extractHeadings('# Title\n\n<Wrapper>\n\n</Other>\n')).toEqual([]);
  });
});
