/**
 * Finding the rendered block a pixel offset falls in.
 *
 * Used for the current-line marker. It is only as precise as the anchor map it
 * is given an offset from - heading-accurate, interpolated in between, exactly
 * as `anchors.ts` describes - so within a long heading-free section the marker
 * drifts toward the middle of the section rather than tracking each line. For
 * prose with headings every screenful, which is what this is for, it lands on
 * the right paragraph.
 */

export interface BlockRect {
  /** Distance from the top of the scrolling document, in unzoomed pixels. */
  top: number;
  height: number;
}

/**
 * The top-level block of the rendered document that covers `offset`.
 *
 * `.mdxstudio-prose` is where `MdxRenderer` puts the document body; its direct
 * children are the paragraphs, headings, lists, tables and component cards the
 * document is made of, which is the granularity a marker wants. Anything below
 * that is an implementation detail of one component.
 */
export function blockAt(container: HTMLElement, offset: number): HTMLElement | null {
  const prose = container.querySelector('.mdxstudio-prose') ?? container;
  const scrollTop = window.scrollY;

  let previous: HTMLElement | null = null;

  for (const child of Array.from(prose.children)) {
    if (!(child instanceof HTMLElement)) continue;

    const rect = child.getBoundingClientRect();
    if (rect.height === 0) continue;

    const top = rect.top + scrollTop;
    if (offset < top) break;
    if (offset < top + rect.height) return child;
    previous = child;
  }

  // Past the last block - the end of the document - so mark the last one.
  return previous;
}

/**
 * Where to draw the marker, in the coordinate space of `root`.
 *
 * `getBoundingClientRect` reports *visual* pixels, so an ancestor `zoom` is
 * already baked into them; dividing by the zoom level converts back to the
 * layout pixels an absolutely positioned child of `root` is placed in. At the
 * default zoom of 1 this is the identity.
 */
export function markerRect(
  block: HTMLElement,
  root: HTMLElement,
  zoom: number
): BlockRect {
  const blockRect = block.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  const scale = zoom > 0 ? zoom : 1;

  return {
    top: (blockRect.top - rootRect.top) / scale,
    height: blockRect.height / scale,
  };
}
