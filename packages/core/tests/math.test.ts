/**
 * `$inline$` and `$$block$$` math.
 *
 * The interesting half of this is what must *not* become math: a dollar sign in
 * prose is money far more often than it is the start of an equation, and a
 * document that silently ate "it costs $5 and $10" would be worse than one with
 * no math support at all.
 */

import { describe, expect, it } from 'vitest';
import { MATH_COMPONENT, parseMdxDocument } from '@mdxstudio/core';

import { findAll, flattenText } from './helpers';
import type { LooseTreeNode } from './helpers';

/** Every math element in the tree, as `{ display, tex }`. */
function mathIn(source: string): Array<{ display: boolean; tex: string }> {
  const { tree, error } = parseMdxDocument(source);
  expect(error).toBeNull();

  return findAll(tree, (node) => node.name === MATH_COMPONENT).map((node) => {
    const attributes = (node.attributes ?? []) as Array<{ name?: string; value?: unknown }>;
    const tex = attributes.find((attribute) => attribute.name === 'tex')?.value;
    return {
      display: node.type === 'mdxJsxFlowElement',
      tex: String(tex ?? ''),
    };
  });
}

function textOf(source: string): string {
  const { tree } = parseMdxDocument(source);
  return flattenText(tree as LooseTreeNode);
}

describe('inline math', () => {
  it('reads a single-dollar span as math', () => {
    expect(mathIn('The area is $\\pi r^2$ exactly.\n')).toEqual([
      { display: false, tex: '\\pi r^2' },
    ]);
  });

  it('reads a double-dollar span written inside a sentence as display math', () => {
    expect(mathIn('Before $$a+b$$ after.\n')).toEqual([{ display: false, tex: 'a+b' }]);
  });

  it('does not read a brace inside math as an MDX expression', () => {
    // The one thing that would make math unusable here: `{b}` in TeX is an
    // argument, and in MDX prose it is JavaScript. The math extension consumes
    // the span first, so the braces never reach the expression parser.
    const source = 'The ratio is $\\frac{a}{b}$ exactly.\n';
    const { slots, error } = parseMdxDocument(source);

    expect(error).toBeNull();
    expect(slots.size).toBe(0);
    expect(mathIn(source)).toEqual([{ display: false, tex: '\\frac{a}{b}' }]);
  });

  it('leaves the surrounding prose alone', () => {
    expect(textOf('An $x$ here.\n')).toContain('An ');
    expect(textOf('An $x$ here.\n')).toContain(' here.');
  });
});

describe('block math', () => {
  it('reads a fenced $$ block as display math', () => {
    expect(mathIn('$$\n\\frac{a}{b}\n$$\n')).toEqual([{ display: true, tex: '\\frac{a}{b}' }]);
  });

  it('keeps multi-line content', () => {
    expect(mathIn('$$\na = 1 \\\\\nb = 2\n$$\n')).toEqual([
      { display: true, tex: 'a = 1 \\\\\nb = 2' },
    ]);
  });
});

describe('dollar signs that are not math', () => {
  it('does not turn two prices in one sentence into an equation', () => {
    expect(mathIn('it costs $5 and $10\n')).toEqual([]);
    expect(textOf('it costs $5 and $10\n')).toContain('it costs $5 and $10');
  });

  it('does not turn a list of prices into an equation', () => {
    expect(mathIn('costs $5, saves $3 more\n')).toEqual([]);
    expect(textOf('costs $5, saves $3 more\n')).toContain('costs $5, saves $3 more');
  });

  it('rejects a span that opens on whitespace', () => {
    expect(mathIn('paid $ 5 or $ 10 today\n')).toEqual([]);
  });

  it('rejects a span whose closing dollar is followed by a digit', () => {
    expect(mathIn('from $1x$5 onwards\n')).toEqual([]);
  });

  it('leaves a lone dollar sign alone', () => {
    expect(mathIn('a $5 bill\n')).toEqual([]);
    expect(textOf('a $5 bill\n')).toContain('a $5 bill');
  });

  it('honours a backslash escape', () => {
    expect(mathIn('escaped \\$x\\$ here\n')).toEqual([]);
    expect(textOf('escaped \\$x\\$ here\n')).toContain('escaped $x$ here');
  });

  it('does not read math inside a code span', () => {
    expect(mathIn('Use `$x^2$` in the source.\n')).toEqual([]);
  });

  it('does not read math inside a fenced block', () => {
    expect(mathIn('```text\n$x^2$\n```\n')).toEqual([]);
  });
});
