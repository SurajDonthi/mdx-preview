/**
 * The line <-> pixel mapping both previews scroll by.
 *
 * No DOM here: the callers hand in their measurements, which is exactly what
 * makes the interpolation testable without a browser.
 */

import { describe, expect, it } from 'vitest';

import { collectScrollAnchors, offsetForLine, lineForOffset } from '../src/scrollSync';
import type { ScrollAnchor } from '../src/scrollSync';

/** Headings 100px apart, in document order. */
function tops(map: Record<string, number>) {
  return (id: string) => (id in map ? map[id] : null);
}

const DOCUMENT = ['# Title', '', 'Intro line.', '', '## Second', '', 'Body.', '', '## Third', '', 'End.'].join(
  '\n'
);

describe('collectScrollAnchors', () => {
  it('pairs each heading with where it was measured', () => {
    const anchors = collectScrollAnchors(DOCUMENT, {
      resolveTop: tops({ title: 0, second: 200, third: 400 }),
      documentHeight: 600,
    });

    expect(anchors).toEqual([
      { line: 1, top: 0 },
      { line: 5, top: 200 },
      { line: 9, top: 400 },
      { line: 11, top: 600 },
    ]);
  });

  it('counts frontmatter towards the line numbers', () => {
    const withFrontmatter = ['---', 'title: "T"', '---', '', '# Title', '', 'Body.'].join('\n');

    const anchors = collectScrollAnchors(withFrontmatter, {
      resolveTop: tops({ title: 40 }),
      documentHeight: 300,
    });

    // The heading is on line 5 of the file, not line 1 of the body.
    expect(anchors.find((anchor) => anchor.top === 40)?.line).toBe(5);
  });

  it('skips a heading that is not currently on the page', () => {
    // What an unmounted <Tabs> panel looks like: in the tree, not in the DOM.
    const anchors = collectScrollAnchors(DOCUMENT, {
      resolveTop: tops({ title: 0, third: 400 }),
      documentHeight: 600,
    });

    expect(anchors.map((anchor) => anchor.line)).toEqual([1, 9, 11]);
  });

  it('always brackets the document so the ends interpolate', () => {
    const noHeadings = 'Just prose.\nAnd more of it.\nAnd more.';

    expect(
      collectScrollAnchors(noHeadings, { resolveTop: () => null, documentHeight: 250 })
    ).toEqual([
      { line: 1, top: 0 },
      { line: 3, top: 250 },
    ]);
  });

  it('returns anchors in line order whatever order the headings resolved in', () => {
    const anchors = collectScrollAnchors(DOCUMENT, {
      resolveTop: tops({ third: 400, title: 0, second: 200 }),
      documentHeight: 600,
    });

    const lines = anchors.map((anchor) => anchor.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });
});

describe('offsetForLine and lineForOffset', () => {
  const anchors: ScrollAnchor[] = [
    { line: 1, top: 0 },
    { line: 11, top: 100 },
    { line: 31, top: 500 },
  ];

  it('lands exactly on an anchor', () => {
    expect(offsetForLine(anchors, 11)).toBe(100);
    expect(lineForOffset(anchors, 100)).toBe(11);
  });

  it('interpolates between two anchors', () => {
    // Halfway from line 11 to line 31 is halfway from 100px to 500px.
    expect(offsetForLine(anchors, 21)).toBe(300);
    expect(lineForOffset(anchors, 300)).toBe(21);
  });

  it('clamps past either end instead of running off', () => {
    expect(offsetForLine(anchors, -5)).toBe(0);
    expect(offsetForLine(anchors, 9999)).toBe(500);
    expect(lineForOffset(anchors, -20)).toBe(1);
    expect(lineForOffset(anchors, 9999)).toBe(31);
  });

  it('round-trips, so syncing one pane cannot walk the other along', () => {
    for (const line of [1, 4, 11, 17, 23, 31]) {
      expect(lineForOffset(anchors, offsetForLine(anchors, line))).toBeCloseTo(line, 6);
    }
  });

  it('is monotonic across the whole document', () => {
    let previous = -Infinity;
    for (let line = 1; line <= 31; line += 1) {
      const offset = offsetForLine(anchors, line);
      expect(offset).toBeGreaterThanOrEqual(previous);
      previous = offset;
    }
  });

  it('survives two anchors sharing a line or a pixel', () => {
    const degenerate: ScrollAnchor[] = [
      { line: 5, top: 50 },
      { line: 5, top: 90 },
      { line: 9, top: 90 },
    ];

    expect(() => offsetForLine(degenerate, 5)).not.toThrow();
    expect(Number.isFinite(offsetForLine(degenerate, 7))).toBe(true);
    expect(Number.isFinite(lineForOffset(degenerate, 90))).toBe(true);
  });

  it('has something sane to say with no anchors at all', () => {
    expect(offsetForLine([], 40)).toBe(0);
    expect(lineForOffset([], 400)).toBe(1);
  });
});
