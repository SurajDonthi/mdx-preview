/**
 * GitHub alert blockquotes.
 *
 * The rule that matters most is the negative one: anything that is not one of
 * the five markers has to stay an ordinary blockquote, because a document full
 * of quoted prose must not start sprouting callouts.
 */

import { describe, expect, it } from 'vitest';
import { parseMdxDocument } from '@mdxstudio/core';

import { findAll, flattenText } from './helpers';
import type { LooseTreeNode } from './helpers';

interface Alert {
  type: string;
  title: string;
  text: string;
}

function parse(source: string): { alerts: Alert[]; blockquotes: LooseTreeNode[] } {
  const { tree, error } = parseMdxDocument(source);
  expect(error).toBeNull();

  const alerts = findAll(tree, (node) => node.name === 'Callout').map((node) => {
    const attributes = (node.attributes ?? []) as Array<{ name?: string; value?: unknown }>;
    const read = (name: string) => String(attributes.find((a) => a.name === name)?.value ?? '');
    return { type: read('type'), title: read('title'), text: flattenText(node).trim() };
  });

  return {
    alerts,
    blockquotes: findAll(tree, (node) => node.type === 'element' && node.tagName === 'blockquote'),
  };
}

describe('alert markers', () => {
  it('maps every marker GitHub defines onto a callout variant', () => {
    const source = [
      '> [!NOTE]\n> A note.',
      '> [!TIP]\n> A tip.',
      '> [!IMPORTANT]\n> Important.',
      '> [!WARNING]\n> Careful.',
      '> [!CAUTION]\n> Dangerous.',
    ].join('\n\n');

    const { alerts, blockquotes } = parse(source);

    expect(alerts).toEqual([
      { type: 'note', title: 'Note', text: 'A note.' },
      { type: 'success', title: 'Tip', text: 'A tip.' },
      { type: 'info', title: 'Important', text: 'Important.' },
      { type: 'warning', title: 'Warning', text: 'Careful.' },
      { type: 'error', title: 'Caution', text: 'Dangerous.' },
    ]);
    // Every quote was consumed; none is left rendering as a quote as well.
    expect(blockquotes).toHaveLength(0);
  });

  it('matches the marker whatever case it was written in', () => {
    expect(parse('> [!note]\n> Lower.\n').alerts).toEqual([
      { type: 'note', title: 'Note', text: 'Lower.' },
    ]);
    expect(parse('> [!WaRnInG]\n> Mixed.\n').alerts).toEqual([
      { type: 'warning', title: 'Warning', text: 'Mixed.' },
    ]);
  });

  it('keeps the whole body, not just the first line', () => {
    const { alerts } = parse('> [!TIP]\n> First line.\n>\n> Second paragraph.\n');

    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain('First line.');
    expect(alerts[0].text).toContain('Second paragraph.');
  });

  it('keeps markdown inside the body', () => {
    const { tree } = parseMdxDocument('> [!NOTE]\n> Some **bold** text.\n');

    expect(findAll(tree, (node) => node.tagName === 'strong')).toHaveLength(1);
  });

  it('converts an alert nested inside a list item', () => {
    const { alerts } = parse('- item\n\n  > [!WARNING]\n  > Nested.\n');

    expect(alerts).toEqual([{ type: 'warning', title: 'Warning', text: 'Nested.' }]);
  });

  it('accepts a marker with no body at all', () => {
    const { alerts } = parse('> [!NOTE]\n');

    expect(alerts).toEqual([{ type: 'note', title: 'Note', text: '' }]);
  });
});

describe('what stays a blockquote', () => {
  it('leaves an unknown marker as a quote', () => {
    const { alerts, blockquotes } = parse('> [!MAYBE]\n> Not a real alert.\n');

    expect(alerts).toHaveLength(0);
    expect(blockquotes).toHaveLength(1);
    expect(flattenText(blockquotes[0])).toContain('[!MAYBE]');
  });

  it('leaves a marker with text on the same line as a quote', () => {
    // GitHub requires the marker alone on its line; matching it here would
    // swallow the author's first sentence into a title.
    const { alerts, blockquotes } = parse('> [!NOTE] and more on the line\n');

    expect(alerts).toHaveLength(0);
    expect(blockquotes).toHaveLength(1);
  });

  it('leaves an ordinary quote alone', () => {
    const { alerts, blockquotes } = parse('> Just a quotation.\n');

    expect(alerts).toHaveLength(0);
    expect(blockquotes).toHaveLength(1);
  });

  it('does not read a marker that is not at the start of the quote', () => {
    const { alerts, blockquotes } = parse('> Leading line.\n>\n> [!NOTE]\n> Body.\n');

    expect(alerts).toHaveLength(0);
    expect(blockquotes).toHaveLength(1);
  });
});
