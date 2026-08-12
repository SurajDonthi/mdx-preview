/**
 * Collapsible heading sections, and the anchor a reader can copy.
 *
 * Four things here are load-bearing and none of them are "a section closes".
 *
 * - The headings themselves. They are what the table of contents scrolls to,
 *   what the editor's scroll sync measures and what the VS Code outline lists,
 *   so they have to stay real `h1`/`h2`/`h3` elements, in document order, with
 *   the ids `extractHeadings()` promises and their own text and nothing else.
 * - Grouping. `h4` and below ride with their parent rather than closing it, and
 *   a document that opens with prose, has no headings at all or repeats a
 *   heading verbatim still renders.
 * - The clipboard. A fragment, because that is the one form that means the same
 *   thing in a browser, in the CLI's client and in the VS Code webview.
 * - The PDF pass deletes every `button` from the export. A section that is shut
 *   there is a chapter deleted from the document, so the export gets every
 *   section open and no controls at all.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectScrollAnchors, extractHeadings } from '@mdxstudio/core';
import { MdxRenderer } from '../src/MdxRenderer';
import { THEMES } from '../src/themes';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const theme = THEMES['github-light'];
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

interface View {
  container: HTMLDivElement;
  update: (content: string) => void;
}

function renderMdx(
  content: string,
  renderMode: 'live' | 'pdf' = 'live',
  collapsibleHeadings = true
): View {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  const draw = (source: string) =>
    act(() => {
      root.render(
        <MdxRenderer
          content={source}
          themeConfig={theme}
          showFrontmatterHeader={false}
          renderMode={renderMode}
          collapsibleHeadings={collapsibleHeadings}
        />
      );
    });

  draw(content);
  return { container, update: draw };
}

const sections = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-section'));

const toggles = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('.mdxstudio-heading__toggle'));

const anchors = (container: HTMLElement): HTMLButtonElement[] =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('.mdxstudio-heading__anchor'));

const headingIds = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).map(
    (heading) => heading.id
  );

/** The section opened by the heading with this id. */
const sectionOf = (container: HTMLElement, id: string): HTMLElement => {
  const heading = container.querySelector<HTMLElement>(`#${id}`);
  const section = heading?.closest<HTMLElement>('.mdxstudio-section');
  if (!section) throw new Error(`no section for #${id}`);
  return section;
};

/** The disclosure inside the heading with this id, if it has one. */
const toggleOf = (container: HTMLElement, id: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`#${id} .mdxstudio-heading__toggle`);

const anchorOf = (container: HTMLElement, id: string): HTMLButtonElement | null =>
  container.querySelector<HTMLButtonElement>(`#${id} .mdxstudio-heading__anchor`);

const click = (element: HTMLElement) => act(() => element.click());

/** Replaces the clipboard with a spy, and hands back what was written to it. */
function stubClipboard(): { writeText: ReturnType<typeof vi.fn> } {
  const writeText = vi.fn((_text: string) => Promise.resolve());
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return { writeText };
}

const DOCUMENT = [
  'Some prose before anything else.',
  '',
  '# Chapter one',
  '',
  'Chapter body.',
  '',
  '## Section A',
  '',
  'Section A body.',
  '',
  '### Detail one',
  '',
  'Detail one body.',
  '',
  '#### A note',
  '',
  'The note body.',
  '',
  '## Section B',
  '',
  'Section B body.',
  '',
  '# Chapter two',
  '',
  'Chapter two body.',
  '',
].join('\n');

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    for (const instance of mounted.splice(0)) {
      instance.root.unmount();
      instance.container.remove();
    }
  });
  vi.restoreAllMocks();
});

describe('grouping', () => {
  it('opens a section at h1, h2 and h3', () => {
    const { container } = renderMdx(DOCUMENT);

    expect(sections(container).map((section) => section.dataset.mdxstudioLevel)).toEqual([
      '1',
      '2',
      '3',
      '2',
      '1',
    ]);
  });

  it('nests a section inside the one that encloses it', () => {
    const { container } = renderMdx(DOCUMENT);

    const chapter = sectionOf(container, 'chapter-one');
    const sectionA = sectionOf(container, 'section-a');
    const detail = sectionOf(container, 'detail-one');

    expect(chapter.contains(sectionA)).toBe(true);
    expect(sectionA.contains(detail)).toBe(true);
    // ...and the body, not the heading, is what holds it.
    expect(sectionA.querySelector('.mdxstudio-section__body')?.contains(detail)).toBe(true);
  });

  it('ends a section at the next heading of the same level or a shallower one', () => {
    const { container } = renderMdx(DOCUMENT);

    const sectionA = sectionOf(container, 'section-a');
    const sectionB = sectionOf(container, 'section-b');
    const chapterTwo = sectionOf(container, 'chapter-two');

    expect(sectionA.contains(sectionB)).toBe(false);
    expect(sectionOf(container, 'chapter-one').contains(sectionB)).toBe(true);
    expect(sectionOf(container, 'chapter-one').contains(chapterTwo)).toBe(false);
  });

  it('leaves h4 to h6 inside the section that encloses them', () => {
    const { container } = renderMdx(
      ['# Top', '', '#### Four', '', 'Four body.', '', '##### Five', '', 'Five body.', ''].join(
        '\n'
      )
    );

    expect(sections(container)).toHaveLength(1);
    const body = container.querySelector('.mdxstudio-section__body');
    expect(body?.querySelector('h4')?.textContent).toBe('Four');
    expect(body?.querySelector('h5')?.textContent).toBe('Five');
    expect(toggleOf(container, 'four')).toBeNull();
    expect(anchorOf(container, 'four')).toBeNull();
  });

  it('collapses an h4 with the section it sits in', () => {
    const { container } = renderMdx(DOCUMENT);

    click(toggleOf(container, 'detail-one')!);

    expect(container.querySelector('h4')).toBeNull();
    expect(container.textContent).not.toContain('The note body.');
    // The heading that was collapsed is still there to reopen.
    expect(container.querySelector('#detail-one')).not.toBeNull();
  });

  it('leaves content written before the first heading where it is', () => {
    const { container } = renderMdx(DOCUMENT);

    const intro = Array.from(container.querySelectorAll('.mdxstudio-p')).find((node) =>
      node.textContent?.includes('Some prose before anything else.')
    );
    expect(intro).toBeDefined();
    expect(intro!.closest('.mdxstudio-section')).toBeNull();

    click(toggles(container)[0]);
    expect(container.textContent).toContain('Some prose before anything else.');
  });

  it('renders a document with no headings at all', () => {
    const { container } = renderMdx('Just a paragraph.\n\n- and a list\n');

    expect(sections(container)).toHaveLength(0);
    expect(toggles(container)).toHaveLength(0);
    expect(container.textContent).toContain('Just a paragraph.');
  });

  it('gives no disclosure to a heading with nothing under it', () => {
    const { container } = renderMdx('## First\n\n## Second\n\nBody.\n');

    expect(toggleOf(container, 'first')).toBeNull();
    expect(toggleOf(container, 'second')).not.toBeNull();
    // The anchor does not depend on there being a body.
    expect(anchorOf(container, 'first')).not.toBeNull();
  });

  it('tells apart two headings written the same way', () => {
    const { container } = renderMdx(
      ['## Notes', '', 'First body.', '', '## Notes', '', 'Second body.', ''].join('\n')
    );

    expect(headingIds(container)).toEqual(['notes', 'notes-1']);

    click(toggleOf(container, 'notes')!);

    expect(container.textContent).not.toContain('First body.');
    expect(container.textContent).toContain('Second body.');
  });

  it('renders a heading with no text', () => {
    const { container } = renderMdx('##\n\nBody.\n\n## \n\nMore.\n');

    expect(() => renderMdx('##\n')).not.toThrow();
    expect(headingIds(container)).toEqual(['heading', 'heading-1']);
    expect(anchorOf(container, 'heading')?.getAttribute('aria-label')).toBe(
      'Copy link to this heading'
    );
  });

  it('groups once, however many times the document is rendered', () => {
    // The parse cache hands one tree to the table of contents, the renderer and
    // the exporter, so the transform runs over a tree it has already grouped.
    const { container, update } = renderMdx(DOCUMENT);
    const before = sections(container).length;

    update(DOCUMENT);
    update(DOCUMENT);

    expect(sections(container)).toHaveLength(before);
    expect(headingIds(container)).toEqual(extractHeadings(DOCUMENT).map((h) => h.id));
  });
});

describe('the headings the rest of the toolchain reads', () => {
  it('keeps every id, in the order extractHeadings() gives them', () => {
    const { container } = renderMdx(DOCUMENT);

    expect(headingIds(container)).toEqual(extractHeadings(DOCUMENT).map((h) => h.id));
  });

  it('keeps the text of the heading itself, controls and all', () => {
    const { container } = renderMdx(DOCUMENT);

    expect(container.querySelector('#section-a')?.textContent).toBe('Section A');
    expect(container.querySelector('#section-a')?.tagName).toBe('H2');
  });

  it('takes a collapsed section out of the DOM rather than hiding it', () => {
    // A hidden heading is still found by `document.getElementById`, and a
    // scroll-spy that measures one reads a zero offset for it.
    const { container } = renderMdx(DOCUMENT);

    click(toggleOf(container, 'chapter-one')!);

    expect(headingIds(container)).toEqual(['chapter-one', 'chapter-two']);
    expect(container.querySelector('#section-a')).toBeNull();

    click(toggleOf(container, 'chapter-one')!);

    expect(headingIds(container)).toEqual(extractHeadings(DOCUMENT).map((h) => h.id));
  });

  it('offers the editor scroll sync only the headings on the page', () => {
    const { container } = renderMdx(DOCUMENT);

    click(toggleOf(container, 'section-a')!);

    const onPage = Array.from(container.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    const asked: string[] = [];

    const anchors = collectScrollAnchors(DOCUMENT, {
      // The hosts all resolve a heading id against the DOM. jsdom lays nothing
      // out, so the offset each heading would report stands in as its place in
      // the document - what matters is which ones answer at all.
      resolveTop: (id) => {
        const element = container.querySelector<HTMLElement>(`#${id}`);
        if (!element) return null;
        asked.push(id);
        return (onPage.indexOf(element) + 1) * 100;
      },
      documentHeight: 5000,
    });

    expect(asked).toEqual(['chapter-one', 'section-a', 'section-b', 'chapter-two']);

    // Both axes have to keep climbing, or the interpolation between two
    // anchors runs backwards and the editor jumps the wrong way.
    for (let index = 1; index < anchors.length; index++) {
      expect(anchors[index].line).toBeGreaterThan(anchors[index - 1].line);
      expect(anchors[index].top).toBeGreaterThan(anchors[index - 1].top);
    }
  });

  it('reopens a section whose heading was replaced under it', () => {
    const { container, update } = renderMdx('## First\n\nBody.\n');

    click(toggles(container)[0]);
    expect(container.textContent).not.toContain('Body.');

    update('## Renamed\n\nBody.\n');

    expect(toggles(container)[0].getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Body.');
  });
});

describe('the disclosure', () => {
  it('is a button wired to the body it shows', () => {
    const { container } = renderMdx(DOCUMENT);

    const toggle = toggleOf(container, 'section-a')!;
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    const bodyId = toggle.getAttribute('aria-controls');
    expect(bodyId).toBeTruthy();

    const body = sectionOf(container, 'section-a').querySelector('.mdxstudio-section__body');
    expect(body?.id).toBe(bodyId);
    expect((body as HTMLElement).hidden).toBe(false);
  });

  it('names the heading it opens and shuts', () => {
    const { container } = renderMdx(DOCUMENT);
    const toggle = toggleOf(container, 'section-a')!;

    expect(toggle.getAttribute('aria-label')).toBe('Collapse "Section A"');

    click(toggle);

    expect(toggleOf(container, 'section-a')!.getAttribute('aria-label')).toBe(
      'Expand "Section A"'
    );
  });

  it('follows the section it controls', () => {
    const { container } = renderMdx(DOCUMENT);

    click(toggleOf(container, 'section-a')!);

    const toggle = toggleOf(container, 'section-a')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(sectionOf(container, 'section-a').dataset.collapsed).toBe('true');
    expect(
      sectionOf(container, 'section-a').querySelector<HTMLElement>('.mdxstudio-section__body')!
        .hidden
    ).toBe(true);

    click(toggle);

    expect(toggleOf(container, 'section-a')!.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Section A body.');
  });

  it('gives every section on the page a body id of its own', () => {
    const { container } = renderMdx(DOCUMENT);

    const ids = toggles(container).map((toggle) => toggle.getAttribute('aria-controls'));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('shuts only the section it belongs to', () => {
    const { container } = renderMdx(DOCUMENT);

    click(toggleOf(container, 'section-a')!);

    expect(container.textContent).not.toContain('Section A body.');
    expect(container.textContent).toContain('Section B body.');
    expect(container.textContent).toContain('Chapter body.');
  });

  it('does not toggle when the heading itself is clicked', () => {
    // A reader selecting a sentence out of a heading must not lose the section
    // under it, so nothing but the chevron opens and shuts one.
    const { container } = renderMdx(DOCUMENT);

    const heading = container.querySelector<HTMLElement>('#section-a')!;
    click(heading);

    expect(toggleOf(container, 'section-a')!.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Section A body.');
  });
});

describe('the anchor', () => {
  it('copies the fragment, and only the fragment', () => {
    const { writeText } = stubClipboard();
    const { container } = renderMdx(DOCUMENT);

    click(anchorOf(container, 'section-a')!);

    expect(writeText).toHaveBeenCalledWith('#section-a');
  });

  it('copies the id the table of contents links to', () => {
    const { writeText } = stubClipboard();
    const { container } = renderMdx(
      ['## Notes', '', 'First.', '', '## Notes', '', 'Second.', ''].join('\n')
    );

    click(anchors(container)[1]);

    expect(writeText).toHaveBeenCalledWith('#notes-1');
    expect(extractHeadings('## Notes\n\nFirst.\n\n## Notes\n\nSecond.\n')[1].id).toBe('notes-1');
  });

  it('names its heading out loud', () => {
    const { container } = renderMdx(DOCUMENT);

    expect(anchorOf(container, 'section-a')?.getAttribute('aria-label')).toBe(
      'Copy link to "Section A"'
    );
    expect(anchorOf(container, 'section-a')?.getAttribute('title')).toBe(
      'Copy link to "Section A"'
    );
  });

  it('says so after a copy', () => {
    stubClipboard();
    const { container } = renderMdx(DOCUMENT);

    const anchor = anchorOf(container, 'section-a')!;
    expect(anchor.querySelector('.lucide-check')).toBeNull();

    click(anchor);

    expect(anchorOf(container, 'section-a')!.querySelector('.lucide-check')).not.toBeNull();
  });

  it('is on every h1 to h3 and on nothing deeper', () => {
    const { container } = renderMdx(DOCUMENT);

    expect(anchors(container)).toHaveLength(5);
    expect(container.querySelector('h4 .mdxstudio-heading__anchor')).toBeNull();
  });

  it('does not take the document down when there is no clipboard at all', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const { container } = renderMdx(DOCUMENT);

    expect(() => click(anchorOf(container, 'section-a')!)).not.toThrow();
    expect(container.textContent).toContain('Section A body.');
  });
});

describe('the PDF export', () => {
  it('renders every section open', () => {
    const { container } = renderMdx(DOCUMENT, 'pdf');

    expect(container.querySelectorAll('.mdxstudio-section__body[hidden]')).toHaveLength(0);
    for (const text of [
      'Chapter body.',
      'Section A body.',
      'Detail one body.',
      'The note body.',
      'Section B body.',
      'Chapter two body.',
    ]) {
      expect(container.textContent).toContain(text);
    }
  });

  it('writes no control the export could delete', () => {
    const { container } = renderMdx(DOCUMENT, 'pdf');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(toggles(container)).toHaveLength(0);
    expect(anchors(container)).toHaveLength(0);
  });

  it('still stamps the ids and keeps the sections in document order', () => {
    const { container } = renderMdx(DOCUMENT, 'pdf');

    expect(headingIds(container)).toEqual(extractHeadings(DOCUMENT).map((h) => h.id));
  });
});

describe('collapsibleHeadings={false}', () => {
  it('renders headings with no sections and nothing to fold', () => {
    const { container } = renderMdx(DOCUMENT, 'live', false);

    expect(sections(container)).toHaveLength(0);
    expect(toggles(container)).toHaveLength(0);
  });

  it('keeps the copy anchor, which is a different control', () => {
    // Turning off folding is not a reason to stop a reader linking to a
    // heading, so the anchor survives.
    const { container } = renderMdx(DOCUMENT, 'live', false);

    expect(anchors(container).length).toBeGreaterThan(0);
  });

  it('keeps every id, and keeps them in document order', () => {
    // The table of contents, the anchors and the outline all read these, and
    // none of that is what the option turns off.
    const { container } = renderMdx(DOCUMENT, 'live', false);

    expect(headingIds(container)).toEqual(extractHeadings(DOCUMENT).map((h) => h.id));
  });

  it('leaves every heading on the page for the scroll sync to measure', () => {
    const on = renderMdx(DOCUMENT, 'live', true);
    const off = renderMdx(DOCUMENT, 'live', false);

    // Nothing is foldable, so nothing can be missing - the anchor list is the
    // one an all-expanded document gives.
    expect(headingIds(off.container)).toEqual(headingIds(on.container));
  });

  it('does not lose the body of any section', () => {
    const { container } = renderMdx(DOCUMENT, 'live', false);

    expect(container.textContent).toContain('Some prose before anything else.');
    expect(container.textContent).toContain('Chapter body.');
    expect(container.textContent).toContain('Detail one body.');
  });

  it('can be turned back on without a remount', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    const draw = (collapsible: boolean) =>
      act(() => {
        root.render(
          <MdxRenderer
            content={DOCUMENT}
            themeConfig={theme}
            showFrontmatterHeader={false}
            collapsibleHeadings={collapsible}
          />
        );
      });

    draw(false);
    expect(sections(container)).toHaveLength(0);

    draw(true);
    expect(sections(container).length).toBeGreaterThan(0);
    expect(headingIds(container)).toEqual(extractHeadings(DOCUMENT).map((h) => h.id));
  });
});
