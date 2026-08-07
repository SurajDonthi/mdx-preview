/**
 * Frontmatter splitting. Two things matter beyond the parsed values: the body
 * that comes back must be exactly what the MDX parser is then given (every
 * reported line is offset against it), and a broken YAML header must degrade to
 * "no frontmatter" rather than taking the document with it.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateDocumentStats, countLines, parseFrontmatter } from '@mdxstudio/core';

const withFrontmatter = (yaml: string, body: string) => `---\n${yaml}\n---\n${body}`;

describe('parseFrontmatter', () => {
  it('reports no frontmatter when there is none', () => {
    const content = '# Title\n\nBody.\n';

    expect(parseFrontmatter(content)).toEqual({
      frontmatter: null,
      body: content,
      rawYaml: null,
    });
  });

  it('only treats a block at the very start of the document as frontmatter', () => {
    const content = 'Intro paragraph.\n\n---\ntitle: Nope\n---\n\n# Title\n';

    expect(parseFrontmatter(content).frontmatter).toBeNull();
    expect(parseFrontmatter(content).body).toBe(content);
  });

  it('parses scalars and leaves the body starting after the closing fence', () => {
    const { frontmatter, body, rawYaml } = parseFrontmatter(
      withFrontmatter('title: Architecture\nreadTime: "10 min read"', '# Architecture\n\nBody.\n')
    );

    expect(frontmatter).toEqual({ title: 'Architecture', readTime: '10 min read' });
    expect(body).toBe('# Architecture\n\nBody.\n');
    expect(rawYaml).toBe('title: Architecture\nreadTime: "10 min read"');
  });

  it('parses nested objects', () => {
    const { frontmatter } = parseFrontmatter(
      withFrontmatter('author:\n  name: Ada\n  links:\n    site: example.com', 'body\n')
    );

    expect(frontmatter).toEqual({ author: { name: 'Ada', links: { site: 'example.com' } } });
  });

  it('parses arrays in both block and flow form', () => {
    const { frontmatter } = parseFrontmatter(
      withFrontmatter('tags:\n  - Architecture\n  - Renderer\nflow: [a, b]', 'body\n')
    );

    expect(frontmatter).toEqual({ tags: ['Architecture', 'Renderer'], flow: ['a', 'b'] });
  });

  it('leaves dates as strings so the header can print them verbatim', () => {
    const { frontmatter } = parseFrontmatter(
      withFrontmatter('date: 2026-08-04\nquoted: "2026-08-04"', 'body\n')
    );

    expect(frontmatter).toEqual({ date: '2026-08-04', quoted: '2026-08-04' });
    expect(frontmatter?.date).not.toBeInstanceOf(Date);
  });

  it('degrades to no frontmatter when the YAML is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { frontmatter, body, rawYaml } = parseFrontmatter(
      withFrontmatter('title: A\nbad: [unclosed', '# Still a document\n')
    );

    expect(frontmatter).toBeNull();
    // The block is still peeled off, so the parser never sees it as markdown.
    expect(body).toBe('# Still a document\n');
    expect(rawYaml).toBe('title: A\nbad: [unclosed');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('degrades when the YAML parses to a scalar', () => {
    expect(parseFrontmatter(withFrontmatter('just a string', 'body\n')).frontmatter).toBeNull();
    expect(parseFrontmatter(withFrontmatter('42', 'body\n')).frontmatter).toBeNull();
  });

  it('KNOWN GAP: a YAML sequence passes the object check and is returned as frontmatter', () => {
    // `typeof parsed === 'object' && parsed !== null` also admits arrays, so a
    // top-level YAML list is handed back as a `Frontmatter`. Nothing downstream
    // crashes - FrontmatterHeader just reads undefined off it - but the type is
    // a lie. Characterised rather than fixed; see the report.
    const { frontmatter } = parseFrontmatter(withFrontmatter('- a\n- b', 'body\n'));

    expect(Array.isArray(frontmatter)).toBe(true);
    expect(frontmatter?.title).toBeUndefined();
  });

  it('handles an empty frontmatter block', () => {
    const { frontmatter, body } = parseFrontmatter('---\n\n---\nbody\n');

    expect(frontmatter).toBeNull();
    expect(body).toBe('body\n');
  });

  it('handles CRLF line endings', () => {
    const { frontmatter, body } = parseFrontmatter('---\r\ntitle: A\r\n---\r\n# Title\r\n');

    expect(frontmatter).toEqual({ title: 'A' });
    expect(body).toBe('# Title\r\n');
  });

  it('handles a document that is nothing but frontmatter', () => {
    const { frontmatter, body } = parseFrontmatter('---\ntitle: A\n---');

    expect(frontmatter).toEqual({ title: 'A' });
    expect(body).toBe('');
  });

  it('leaves a body offset the caller can measure exactly', () => {
    // This is how MdxRenderer and extractHeadings derive lineOffset; if the
    // split moved by a line every reported position would be off by one.
    const content = withFrontmatter('title: A\ntags: [x]', '# Title\n\n<Broken\n');
    const { body } = parseFrontmatter(content);

    expect(countLines(content.slice(0, content.length - body.length))).toBe(4);
  });
});

describe('calculateDocumentStats', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts words outside code fences and JSX tags', () => {
    const content = withFrontmatter(
      'title: A',
      ['# One two three', '', '```js', 'const ignored = "words";', '```', '', '<Callout>four</Callout>'].join(
        '\n'
      )
    );

    const stats = calculateDocumentStats(content);

    expect(stats.words).toBe(5); // "# One two three" -> 4 tokens, plus "four"
    expect(stats.headingsCount).toBe(1);
    expect(stats.readingTimeMinutes).toBe(1);
  });

  it('counts characters of the body only, not the frontmatter', () => {
    const body = '# Title\n';
    expect(calculateDocumentStats(withFrontmatter('title: A', body)).characters).toBe(body.length);
  });

  it('reports an empty document as zero words and one minute', () => {
    expect(calculateDocumentStats('')).toEqual({
      words: 0,
      characters: 0,
      readingTimeMinutes: 1,
      headingsCount: 0,
    });
  });
});
