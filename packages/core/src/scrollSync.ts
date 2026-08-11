/**
 * Mapping between a source line and a pixel offset in a rendered preview.
 *
 * The renderer does not stamp source positions onto the DOM, and adding them
 * would mean replacing its element overrides - which is where all of the
 * styling lives. Headings are the way in instead: `collectHeadings()` is the
 * single definition of a heading's `id`, the renderer stamps exactly those ids
 * onto the tree it renders, and the hast node each one came from still carries
 * the position the parser gave it. So a heading is a point where a line number
 * and a rendered element are known to describe the same thing, and everything
 * between two headings is interpolated.
 *
 * That makes the sync heading-accurate rather than line-accurate. For the
 * documents this is for - prose with headings every screenful - that reads as
 * correct; for a 400-line heading-free block it degrades to a linear guess
 * across the block, which is still monotonic and still lands in the region.
 *
 * Nothing here touches the DOM. Both the VS Code webview, which scrolls the
 * window, and the Studio, which scrolls a div, hand in their own measurements,
 * so the interpolation itself is written and tested once.
 */

import { collectHeadings, parseFrontmatter } from './mdxParser';
import { countLines, parseMdxDocument } from './mdxAst';

export interface ScrollAnchor {
  /** One-based line in the document the user is editing. */
  line: number;
  /** Distance from the top of the scrolling box, in pixels. */
  top: number;
}

export interface ScrollAnchorOptions {
  /**
   * Distance from the top of the scrolling box to the heading with this id, or
   * null when it is not on the page - a heading inside a collapsed `<Tabs>`
   * panel, for instance.
   */
  resolveTop(headingId: string): number | null;
  /** Full scrollable height, so a position past the last heading interpolates. */
  documentHeight: number;
}

/**
 * Every heading that is both in the document and on the page, in order.
 *
 * Headings inside JSX children are skipped for the same reason the table of
 * contents skips them: a component decides whether to mount its children, so
 * `<Tabs>` has at most one panel's worth of them in the DOM at a time.
 */
export function collectScrollAnchors(
  content: string,
  options: ScrollAnchorOptions
): ScrollAnchor[] {
  const { body } = parseFrontmatter(content);
  const lineOffset = countLines(content.slice(0, Math.max(0, content.length - body.length)));
  const { tree } = parseMdxDocument(body, { lineOffset });
  if (!tree) return [];

  const anchors: ScrollAnchor[] = [];

  for (const heading of collectHeadings(tree)) {
    if (heading.insideJsx) continue;

    const line = (heading.node as { position?: { start?: { line?: number } } }).position?.start
      ?.line;
    if (typeof line !== 'number') continue;

    const top = options.resolveTop(heading.id);
    if (top === null) continue;

    anchors.push({ line: line + lineOffset, top });
  }

  anchors.sort((left, right) => left.line - right.line);

  // Endpoints, so a position before the first heading or after the last one is
  // interpolated rather than clamped onto it.
  const documentLines = countLines(content) + 1;
  const bottom = Math.max(
    options.documentHeight,
    anchors.length > 0 ? anchors[anchors.length - 1].top : 0
  );

  const result: ScrollAnchor[] = [];
  if (anchors.length === 0 || anchors[0].line > 1) result.push({ line: 1, top: 0 });
  result.push(...anchors);

  const last = result[result.length - 1];
  if (last.line < documentLines && last.top < bottom) {
    result.push({ line: documentLines, top: bottom });
  }

  return result;
}

/** Where the preview should be scrolled to show `line` at the top. */
export function offsetForLine(anchors: ScrollAnchor[], line: number): number {
  if (anchors.length === 0) return 0;
  if (line <= anchors[0].line) return anchors[0].top;

  for (let index = 1; index < anchors.length; index++) {
    const next = anchors[index];
    if (line > next.line) continue;

    const previous = anchors[index - 1];
    const span = next.line - previous.line;
    if (span <= 0) return next.top;
    const ratio = (line - previous.line) / span;
    return previous.top + ratio * (next.top - previous.top);
  }

  return anchors[anchors.length - 1].top;
}

/** The source line the preview is currently showing at the top. */
export function lineForOffset(anchors: ScrollAnchor[], offset: number): number {
  if (anchors.length === 0) return 1;
  if (offset <= anchors[0].top) return anchors[0].line;

  for (let index = 1; index < anchors.length; index++) {
    const next = anchors[index];
    if (offset > next.top) continue;

    const previous = anchors[index - 1];
    const span = next.top - previous.top;
    if (span <= 0) return next.line;
    const ratio = (offset - previous.top) / span;
    return previous.line + ratio * (next.line - previous.line);
  }

  return anchors[anchors.length - 1].line;
}
