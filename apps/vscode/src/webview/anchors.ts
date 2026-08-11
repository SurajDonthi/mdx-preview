/**
 * The webview's half of the scroll sync.
 *
 * The interpolation itself lives in `@mdxstudio/core` so that this and the
 * Studio's editor/preview sync share one implementation; what is left here is
 * the measuring, which is the part that differs: this preview scrolls the
 * window, and the Studio scrolls a div.
 */

import { collectScrollAnchors } from '@mdxstudio/core';
import type { ScrollAnchor } from '@mdxstudio/core';

export type Anchor = ScrollAnchor;

export { offsetForLine, lineForOffset } from '@mdxstudio/core';

export function collectAnchors(content: string, container: HTMLElement): Anchor[] {
  const scrollTop = window.scrollY;

  return collectScrollAnchors(content, {
    resolveTop: (headingId) => {
      const element = container.querySelector(`#${cssEscape(headingId)}`);
      if (!(element instanceof HTMLElement)) return null;
      // A heading in an unmounted `<Tabs>` panel is in the tree but not on the
      // page, and would otherwise anchor to the top of the document.
      if (element.offsetParent === null && element.getClientRects().length === 0) return null;
      return element.getBoundingClientRect().top + scrollTop;
    },
    documentHeight: document.documentElement.scrollHeight,
  });
}

/**
 * `CSS.escape` for an id used in a selector.
 *
 * Heading ids are slugs - `[a-z0-9-]` - so this only ever has to cope with the
 * leading-digit case, but going through the platform when it is there is free.
 */
function cssEscape(id: string): string {
  const escape = (globalThis as { CSS?: { escape?(value: string): string } }).CSS?.escape;
  return escape ? escape(id) : id.replace(/^(\d)/, '\\3$1 ');
}
