import { describe, expect, it } from 'vitest';

import { documentOutline } from '../src/extension/outline';

/*
 * The outline view and the breadcrumbs. The headings come from
 * `@mdxstudio/core`, so what is tested here is what this module adds: the
 * nesting and the line ranges, both of which are easy to get subtly wrong and
 * invisible until somebody clicks a breadcrumb.
 */

describe('documentOutline', () => {
  it('nests by heading level', () => {
    const outline = documentOutline(
      ['# Title', '', '## One', '', '### Deep', '', '## Two', ''].join('\n')
    );

    expect(outline).toHaveLength(1);
    expect(outline[0].text).toBe('Title');
    expect(outline[0].children.map((child) => child.text)).toEqual(['One', 'Two']);
    expect(outline[0].children[0].children.map((child) => child.text)).toEqual(['Deep']);
  });

  it('gives each heading the lines it owns', () => {
    const outline = documentOutline(
      ['# Title', 'body', '## One', 'body', 'body', '## Two', 'body'].join('\n')
    );

    const [title] = outline;
    const [one, two] = title.children;

    expect(title.line).toBe(1);
    expect(one.line).toBe(3);
    // `## One` runs up to the line before `## Two`.
    expect(one.endLine).toBe(5);
    expect(two.line).toBe(6);
    // The last heading runs to the end of the document.
    expect(two.endLine).toBeGreaterThanOrEqual(7);
    expect(title.endLine).toBe(two.endLine);
  });

  it('counts frontmatter lines, so the ranges point at the real file', () => {
    const outline = documentOutline(
      ['---', 'title: Guide', '---', '', '# Title', '', 'body'].join('\n')
    );

    expect(outline[0].text).toBe('Title');
    expect(outline[0].line).toBe(5);
  });

  it('copes with a document that never uses `#`', () => {
    const outline = documentOutline(['## One', '', '### Deep', '', '## Two'].join('\n'));

    expect(outline.map((heading) => heading.text)).toEqual(['One', 'Two']);
    expect(outline[0].children.map((child) => child.text)).toEqual(['Deep']);
  });

  it('carries the same ids the preview stamps, so an anchor link agrees with it', () => {
    const outline = documentOutline(['# A Title', '', '## A Title', ''].join('\n'));

    expect(outline[0].id).toBe('a-title');
    // Duplicate slugs are numbered, exactly as `collectHeadings` numbers them.
    expect(outline[0].children[0].id).toBe('a-title-1');
  });

  it('is not fooled by a comment in a fenced code block', () => {
    const outline = documentOutline(
      ['# Real', '', '```sh', '# not a heading', '```', ''].join('\n')
    );

    expect(outline).toHaveLength(1);
    expect(outline[0].children).toHaveLength(0);
  });

  it('leaves headings inside JSX out, as the table of contents does', () => {
    const outline = documentOutline(
      ['# Real', '', '<Tabs>', '', '## Hidden', '', '</Tabs>', ''].join('\n')
    );

    expect(outline[0].children).toHaveLength(0);
  });

  it('has nothing to show for a document with no headings', () => {
    expect(documentOutline('just some prose\n')).toEqual([]);
  });
});
