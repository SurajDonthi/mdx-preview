/**
 * The parse path, guarding the bug that shipped: a literal ``` written in prose
 * used to be treated as an unpaired backtick run. The scanner searched forward
 * for a partner, found the *next fence opener*, and from then on read every
 * closing fence as an opening one - silently swallowing the rest of the
 * document (53 lines, in the report that led to the fix).
 *
 * The hand-written scanner is gone; documents are parsed by remark-mdx now. The
 * invariant it violated is what these tests hold: whatever a document says about
 * backticks in prose, everything after it still reaches the tree.
 */

import { describe, expect, it } from 'vitest';
import {
  countLines,
  extractHeadings,
  formatMdxParseError,
  parseMdxDocument,
} from '@mdxstudio/core';
import { codeFences, findAll, flattenText } from './helpers';

/** A document with a literal fence in prose, then real content that must survive. */
function documentWithLiteralFenceInProse(sections: number): string {
  const lines = [
    '# Fencing guide',
    '',
    'To open a code block, type ``` followed by the language name.',
    '',
    '```js',
    'const answer = 42;',
    '```',
    '',
  ];
  for (let index = 1; index <= sections; index += 1) {
    lines.push(`## Section ${index}`, '', `Body of section ${index}.`, '');
  }
  return lines.join('\n');
}

describe('a literal ``` in prose', () => {
  it('does not swallow the fence that follows it', () => {
    const source = documentWithLiteralFenceInProse(1);
    const ast = parseMdxDocument(source);

    expect(ast.error).toBeNull();
    expect(codeFences(ast.tree)).toEqual([{ language: 'js', value: 'const answer = 42;\n' }]);
    expect(flattenText(ast.tree)).toContain('Body of section 1.');
  });

  it('leaves the literal run as text rather than opening a block', () => {
    const ast = parseMdxDocument(documentWithLiteralFenceInProse(1));
    const paragraphs = findAll(
      ast.tree,
      (node) => node.type === 'element' && node.tagName === 'p'
    ).map(flattenText);

    expect(paragraphs[0]).toBe('To open a code block, type ``` followed by the language name.');
  });

  it('keeps every section after it, not just the first', () => {
    const source = documentWithLiteralFenceInProse(20);
    expect(extractHeadings(source).map((heading) => heading.text)).toEqual([
      'Fencing guide',
      ...Array.from({ length: 20 }, (_unused, index) => `Section ${index + 1}`),
    ]);
  });

  it('survives an unpaired single backtick in prose too', () => {
    const source = [
      'Run `npm ci to install, then build.',
      '',
      '```bash',
      'npm run build',
      '```',
      '',
      '## Afterwards',
      '',
      'Still rendered.',
    ].join('\n');

    const ast = parseMdxDocument(source);
    expect(ast.error).toBeNull();
    expect(codeFences(ast.tree)).toEqual([{ language: 'bash', value: 'npm run build\n' }]);
    expect(extractHeadings(source).map((heading) => heading.text)).toEqual(['Afterwards']);
    expect(flattenText(ast.tree)).toContain('Still rendered.');
  });

  it('survives a fence run that ends a line', () => {
    const source = ['A row of backticks ```', '', '# Heading after', '', 'Tail.'].join('\n');
    const ast = parseMdxDocument(source);

    expect(ast.error).toBeNull();
    expect(extractHeadings(source).map((heading) => heading.text)).toEqual(['Heading after']);
    expect(flattenText(ast.tree)).toContain('Tail.');
  });
});

describe('parseMdxDocument', () => {
  it('reports a syntax error with a position instead of throwing', () => {
    // A closing tag that matches nothing is reported where it is written.
    const ast = parseMdxDocument('# Title\n\n<Wrapper>\n\n</Other>\n\n# Tail\n');

    expect(ast.tree).toBeNull();
    expect(ast.error).not.toBeNull();
    expect(ast.error?.point?.line).toBe(5);
    expect(formatMdxParseError(ast.error!)).toMatch(/^Line 5, Column \d+ - /);
  });

  it('lifts a position written into the message into the error itself', () => {
    // Some MDX utilities throw plain errors with the position only in the text.
    // Those get parsed out so the prefix can carry the offset instead.
    const ast = parseMdxDocument('<a>\n</b>\n', { lineOffset: 10 });
    expect(ast.error?.point).not.toBeNull();
    expect(ast.error?.point!.line).toBeGreaterThan(10);
  });

  it('shifts reported positions by lineOffset', () => {
    const source = '<Wrapper>\n\n</Other>\n';
    const withoutOffset = parseMdxDocument(source);
    const withOffset = parseMdxDocument(source, { lineOffset: 5 });

    expect(withoutOffset.error?.point).not.toBeNull();
    expect(withOffset.error?.point?.line).toBe(withoutOffset.error!.point!.line + 5);
    expect(withOffset.error?.point?.column).toBe(withoutOffset.error!.point!.column);
  });

  it('formats an unlocated error as just the message', () => {
    expect(formatMdxParseError({ message: 'boom', point: null })).toBe('boom');
  });

  it('returns one shared parse for the same body and offset', () => {
    const body = '# Cached\n\ntext\n';
    expect(parseMdxDocument(body)).toBe(parseMdxDocument(body));
    expect(parseMdxDocument(body, { lineOffset: 2 })).not.toBe(parseMdxDocument(body));
  });

  it('drops import/export and says so', () => {
    const ast = parseMdxDocument("import x from 'y'\n\n# Title\n");

    expect(ast.error).toBeNull();
    expect(findAll(ast.tree, (node) => node.type === 'mdxjsEsm')).toHaveLength(0);
    expect(ast.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'import/export is not supported in a rendered document and was skipped',
    ]);
  });

  it('drops a valueless expression silently', () => {
    const ast = parseMdxDocument('{/* just a note */}\n\n# Title\n');

    expect(ast.error).toBeNull();
    expect(ast.diagnostics).toEqual([]);
    expect(ast.slots.size).toBe(0);
  });

  it('registers every author expression as a slot', () => {
    const ast = parseMdxDocument('<Stat value={1 + 1} label="x" />\n\n{"body"}\n');
    const kinds = [...ast.slots.values()].map((slot) => slot.kind).sort();

    expect(kinds).toEqual(['attribute', 'flow']);
    expect([...ast.slots.values()].find((slot) => slot.kind === 'attribute')?.label).toBe(
      '<Stat> value'
    );
  });
});

describe('extra pipeline plugins', () => {
  /** Rewrites every heading's text, so the effect is visible in the tree. */
  const shout = () => (tree: unknown) => {
    const visit = (node: any): void => {
      if (node.type === 'text') node.value = String(node.value).toUpperCase();
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };

  /** Marks the hast root, which only a rehype plugin can reach. */
  const stamp = () => (tree: any) => {
    tree.children.unshift({ type: 'element', tagName: 'hr', properties: { id: 'stamped' }, children: [] });
  };

  const remarkPlugins = [shout];
  const rehypePlugins = [stamp];

  it('applies a host remark plugin', () => {
    const ast = parseMdxDocument('# quiet\n', { remarkPlugins });

    expect(flattenText(ast.tree)).toContain('QUIET');
  });

  it('applies a host rehype plugin', () => {
    const ast = parseMdxDocument('# heading\n', { rehypePlugins });

    expect(findAll(ast.tree, (node) => node.properties?.id === 'stamped')).toHaveLength(1);
  });

  it('does not hand a plugin-less caller the extended tree', () => {
    const body = '# quiet\n';
    const plain = parseMdxDocument(body);
    const extended = parseMdxDocument(body, { remarkPlugins });

    expect(plain).not.toBe(extended);
    expect(flattenText(plain.tree)).toContain('quiet');
  });

  it('reuses one parse for the same lists', () => {
    const body = '# same\n';

    expect(parseMdxDocument(body, { remarkPlugins })).toBe(
      parseMdxDocument(body, { remarkPlugins })
    );
  });

  it('treats empty lists as no plugins at all', () => {
    const body = '# empty\n';

    expect(parseMdxDocument(body, { remarkPlugins: [], rehypePlugins: [] })).toBe(
      parseMdxDocument(body)
    );
  });
});

describe('countLines', () => {
  it('counts newlines, not lines', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(0);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\nb\nc')).toBe(2);
  });
});
