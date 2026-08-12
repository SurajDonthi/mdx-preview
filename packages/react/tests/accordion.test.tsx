/**
 * The accordion.
 *
 * Three things here are load-bearing and none of them are "a panel opens".
 *
 * - Panels are children now, which is the only way markdown can appear inside
 *   one, so one test runs a real document with a fence, a list and a nested
 *   component through the parser rather than handing the component JSX.
 * - `items={[...]}` is published API. It has to keep rendering.
 * - The PDF pass deletes every `button` from the export. A panel that is shut
 *   there is content deleted from the document, so the export gets every panel
 *   open and a trigger that is not a button.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxRenderContext } from '@mdxstudio/core';
import { createWhitePaperContainer } from '@mdxstudio/pdf';
import { Accordion, AccordionItem, Callout } from '../src/CustomComponents';
import { MdxRenderer } from '../src/MdxRenderer';
import { THEMES } from '../src/themes';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const theme = THEMES['github-light'];
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

/** Mounts a tree, optionally in the render mode the PDF pass uses. */
function render(node: React.ReactNode, renderMode: 'live' | 'pdf' = 'live'): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  act(() => {
    root.render(
      <MdxRenderContext.Provider value={{ renderMode, themeCategory: 'light' }}>
        {node}
      </MdxRenderContext.Provider>
    );
  });

  return container;
}

/** Mounts a real document, so the panels come out of the MDX parser. */
function renderMdx(content: string, renderMode: 'live' | 'pdf' = 'live'): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });

  act(() => {
    root.render(
      <MdxRenderer
        content={content}
        themeConfig={theme}
        showFrontmatterHeader={false}
        renderMode={renderMode}
      />
    );
  });

  return container;
}

const triggers = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-accordion__trigger'));

const panels = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-accordion__panel'));

/** The panels a reader can actually see. */
const openTitles = (container: HTMLElement): string[] =>
  panels(container)
    .map((panel, index) => (panel.hidden ? null : titles(container)[index]))
    .filter((title): title is string => title !== null);

const titles = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-accordion__title')).map(
    (title) => title.textContent ?? ''
  );

const click = (element: HTMLElement) => act(() => element.click());

const press = (element: HTMLElement, key: string) =>
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });

const LEGACY_ITEMS = [
  { title: 'First question', content: 'First answer.' },
  { title: 'Second question', content: 'Second answer.' },
  { title: 'Third question', content: 'Third answer.' },
];

function threePanels(props: Record<string, unknown> = {}) {
  return (
    <Accordion {...props}>
      <AccordionItem title="First question">First answer.</AccordionItem>
      <AccordionItem title="Second question">Second answer.</AccordionItem>
      <AccordionItem title="Third question">Third answer.</AccordionItem>
    </Accordion>
  );
}

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
  document.querySelectorAll('.pdf-export-paper-sheet').forEach((sheet) => sheet.remove());
  vi.restoreAllMocks();
});

describe('panels written as children', () => {
  it('turns each AccordionItem into a trigger and a panel', () => {
    const container = render(threePanels());

    expect(titles(container)).toEqual(['First question', 'Second question', 'Third question']);
    expect(panels(container)).toHaveLength(3);
    expect(container.textContent).toContain('Second answer.');
  });

  it('parses markdown inside a panel', () => {
    // The whole point of the change: content reaches the panel through the MDX
    // pipeline, so a fence is a fence and a list is a list.
    const container = renderMdx(
      [
        '<Accordion>',
        '<AccordionItem title="How does parsing work?">',
        '',
        'A paragraph with **bold** in it.',
        '',
        '- first',
        '- second',
        '',
        '```ts',
        'const answer = 42;',
        '```',
        '',
        '<Callout type="warning" title="Nested">Mind the gap.</Callout>',
        '',
        '</AccordionItem>',
        '</Accordion>',
        '',
      ].join('\n')
    );

    const panel = panels(container)[0];
    expect(panel).toBeDefined();
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('strong')?.textContent).toBe('bold');
    expect(panel.querySelectorAll('.mdxstudio-li')).toHaveLength(2);
    expect(panel.querySelector('pre')?.textContent).toContain('const answer = 42;');
    expect(panel.querySelector('.mdxstudio-callout--warning')).not.toBeNull();
    expect(titles(container)).toEqual(['How does parsing work?']);
  });

  it('keeps a closed panel mounted rather than unmounting its content', () => {
    const container = render(threePanels());
    const [, second] = panels(container);

    expect(second.hidden).toBe(true);
    expect(second.textContent).toContain('Second answer.');
  });

  it('takes the icon, subtitle and badge Card already takes', () => {
    const container = render(
      <Accordion>
        <AccordionItem title="Shielded" icon="Shield" subtitle="Reads well" badge="New">
          Body.
        </AccordionItem>
      </Accordion>
    );

    expect(container.querySelector('.mdxstudio-accordion__subtitle')?.textContent).toBe(
      'Reads well'
    );
    expect(container.querySelector('.mdxstudio-accordion__badge')?.textContent).toBe('New');
    expect(container.querySelector('.mdxstudio-accordion__icon')).not.toBeNull();
  });

  it('groups panels written without a blank line between them', () => {
    // The parser makes one paragraph of those, which would otherwise leave a
    // row of one-panel accordions inside a stray block.
    const container = renderMdx(
      [
        '<Accordion defaultOpen="none">',
        '<AccordionItem title="One">Alpha.</AccordionItem>',
        '<AccordionItem title="Two">Beta.</AccordionItem>',
        '</Accordion>',
        '',
      ].join('\n')
    );

    expect(container.querySelectorAll('.mdxstudio-accordion')).toHaveLength(1);
    expect(titles(container)).toEqual(['One', 'Two']);
    expect(openTitles(container)).toEqual([]);
    expect(container.querySelector('.mdxstudio-accordion__loose')).toBeNull();
  });

  it('lifts panels out of a wrapper that is not one', () => {
    const container = render(
      <Accordion multiple defaultOpen="all">
        <p>
          <AccordionItem title="One">Alpha.</AccordionItem>
          <AccordionItem title="Two">Beta.</AccordionItem>
        </p>
      </Accordion>
    );

    expect(titles(container)).toEqual(['One', 'Two']);
    expect(openTitles(container)).toEqual(['One', 'Two']);
  });

  it('renders a lone AccordionItem as a one-panel accordion', () => {
    const container = render(<AccordionItem title="On its own">Body.</AccordionItem>);

    expect(titles(container)).toEqual(['On its own']);
    expect(panels(container)[0].hidden).toBe(false);
  });
});

describe('the items prop', () => {
  it('still renders the 0.2.3 form', () => {
    const container = render(<Accordion items={LEGACY_ITEMS} />);

    expect(titles(container)).toEqual(['First question', 'Second question', 'Third question']);
    expect(openTitles(container)).toEqual(['First question']);
    expect(panels(container)[0].textContent).toBe('First answer.');
  });

  it('renders it from a document, the way it was always written', () => {
    const container = renderMdx(
      [
        '<Accordion items={[',
        '  { title: "Can I upload files?", content: "Yes." },',
        '  { title: "Is frontmatter supported?", content: "Fully." }',
        ']} />',
        '',
      ].join('\n')
    );

    expect(titles(container)).toEqual(['Can I upload files?', 'Is frontmatter supported?']);
    expect(container.textContent).toContain('Yes.');
  });

  it('accepts a node as content, not only a string', () => {
    const container = render(
      <Accordion items={[{ title: 'Rich', content: <em>emphasised</em> }]} />
    );

    expect(panels(container)[0].querySelector('em')?.textContent).toBe('emphasised');
  });

  it('reads the same extra fields a child panel does', () => {
    const container = render(
      <Accordion items={[{ title: 'Rich', content: 'Body.', icon: 'Shield', badge: 'New' }]} />
    );

    expect(container.querySelector('.mdxstudio-accordion__badge')?.textContent).toBe('New');
    expect(container.querySelector('.mdxstudio-accordion__icon')).not.toBeNull();
  });

  it('yields to children when a document gives both', () => {
    const container = render(
      <Accordion items={LEGACY_ITEMS}>
        <AccordionItem title="Written as a child">Body.</AccordionItem>
      </Accordion>
    );

    expect(titles(container)).toEqual(['Written as a child']);
  });
});

describe('what starts open', () => {
  it('opens the first panel when nothing says otherwise', () => {
    expect(openTitles(render(threePanels()))).toEqual(['First question']);
  });

  it('opens the panels that asked, instead of the first', () => {
    const container = render(
      <Accordion multiple>
        <AccordionItem title="One">1</AccordionItem>
        <AccordionItem title="Two" defaultOpen>
          2
        </AccordionItem>
        <AccordionItem title="Three" defaultOpen>
          3
        </AccordionItem>
      </Accordion>
    );

    expect(openTitles(container)).toEqual(['Two', 'Three']);
  });

  it('opens a panel a document asked for with a bare attribute', () => {
    const container = renderMdx(
      [
        '<Accordion>',
        '<AccordionItem title="Shut">',
        '',
        'One.',
        '',
        '</AccordionItem>',
        '<AccordionItem title="Open" defaultOpen>',
        '',
        'Two.',
        '',
        '</AccordionItem>',
        '</Accordion>',
        '',
      ].join('\n')
    );

    expect(openTitles(container)).toEqual(['Open']);
  });

  it('closes everything on defaultOpen="none"', () => {
    expect(openTitles(render(threePanels({ defaultOpen: 'none' })))).toEqual([]);
    expect(openTitles(render(threePanels({ defaultOpen: false })))).toEqual([]);
  });

  it('opens everything on defaultOpen="all" when more than one may be open', () => {
    const container = render(threePanels({ defaultOpen: 'all', multiple: true }));

    expect(openTitles(container)).toEqual([
      'First question',
      'Second question',
      'Third question',
    ]);
  });

  it('opens a panel by index, by title and by list', () => {
    expect(openTitles(render(threePanels({ defaultOpen: 2 })))).toEqual(['Third question']);
    expect(openTitles(render(threePanels({ defaultOpen: 'Second question' })))).toEqual([
      'Second question',
    ]);
    expect(openTitles(render(threePanels({ defaultOpen: '1' })))).toEqual(['Second question']);
    expect(
      openTitles(render(threePanels({ defaultOpen: [0, 'Third question'], multiple: true })))
    ).toEqual(['First question', 'Third question']);
  });

  it('keeps one open when a single-panel accordion is told to open several', () => {
    expect(openTitles(render(threePanels({ defaultOpen: 'all' })))).toEqual(['First question']);
  });

  it('opens nothing rather than guessing at a title that is not there', () => {
    expect(openTitles(render(threePanels({ defaultOpen: 'Nothing like this' })))).toEqual([]);
    expect(openTitles(render(threePanels({ defaultOpen: 9 })))).toEqual([]);
  });
});

describe('opening and closing', () => {
  it('closes the open panel and opens the clicked one', () => {
    const container = render(threePanels());

    click(triggers(container)[1]);

    expect(openTitles(container)).toEqual(['Second question']);
  });

  it('closes a panel that is clicked again', () => {
    const container = render(threePanels());

    click(triggers(container)[0]);

    expect(openTitles(container)).toEqual([]);
  });

  it('holds several open at once with multiple', () => {
    const container = render(threePanels({ multiple: true }));

    click(triggers(container)[1]);
    click(triggers(container)[2]);

    expect(openTitles(container)).toEqual([
      'First question',
      'Second question',
      'Third question',
    ]);

    click(triggers(container)[1]);

    expect(openTitles(container)).toEqual(['First question', 'Third question']);
  });
});

describe('the trigger', () => {
  it('is a button wired to its panel', () => {
    const container = render(threePanels());
    const [first, second] = triggers(container);

    expect(first.tagName).toBe('BUTTON');
    expect(first.getAttribute('type')).toBe('button');
    expect(first.getAttribute('aria-expanded')).toBe('true');
    expect(second.getAttribute('aria-expanded')).toBe('false');

    const panelId = first.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(panels(container)[0].id).toBe(panelId);
    expect(panels(container)[0].getAttribute('aria-labelledby')).toBe(first.id);
    expect(panels(container)[0].getAttribute('role')).toBe('region');
  });

  it('follows the panel it controls', () => {
    const container = render(threePanels());

    click(triggers(container)[1]);

    expect(triggers(container)[0].getAttribute('aria-expanded')).toBe('false');
    expect(triggers(container)[1].getAttribute('aria-expanded')).toBe('true');
  });

  it('gives every accordion on the page its own ids', () => {
    const container = render(
      <div>
        {threePanels()}
        {threePanels()}
      </div>
    );

    const ids = panels(container).map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('moves focus with the arrow keys, Home and End', () => {
    const container = render(threePanels());
    const [first, second, third] = triggers(container);

    first.focus();
    press(first, 'ArrowDown');
    expect(document.activeElement).toBe(second);

    press(second, 'ArrowUp');
    expect(document.activeElement).toBe(first);

    press(first, 'End');
    expect(document.activeElement).toBe(third);

    press(third, 'Home');
    expect(document.activeElement).toBe(first);
  });

  it('wraps at both ends', () => {
    const container = render(threePanels());
    const [first, , third] = triggers(container);

    first.focus();
    press(first, 'ArrowUp');
    expect(document.activeElement).toBe(third);

    press(third, 'ArrowDown');
    expect(document.activeElement).toBe(first);
  });

  it('leaves other keys to the browser', () => {
    const container = render(threePanels());
    const [first] = triggers(container);

    first.focus();
    press(first, 'Tab');

    expect(document.activeElement).toBe(first);
  });

  it('does not steal the arrow keys of a nested accordion', () => {
    const container = render(
      <Accordion>
        <AccordionItem title="Outer">
          <Accordion>
            <AccordionItem title="Inner one">1</AccordionItem>
            <AccordionItem title="Inner two">2</AccordionItem>
          </Accordion>
        </AccordionItem>
      </Accordion>
    );

    const all = triggers(container);
    const [outer, innerOne, innerTwo] = all;
    expect(all).toHaveLength(3);

    innerOne.focus();
    press(innerOne, 'ArrowDown');

    expect(document.activeElement).toBe(innerTwo);
    expect(document.activeElement).not.toBe(outer);
  });
});

describe('the PDF export', () => {
  it('opens every panel', () => {
    const container = render(threePanels({ defaultOpen: 'none' }), 'pdf');

    expect(openTitles(container)).toEqual([
      'First question',
      'Second question',
      'Third question',
    ]);
    expect(panels(container).every((panel) => !panel.hidden)).toBe(true);
  });

  it('writes the trigger as something the export does not delete', () => {
    const container = render(threePanels(), 'pdf');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(triggers(container).map((trigger) => trigger.tagName)).toEqual(['DIV', 'DIV', 'DIV']);
  });

  it('keeps every question and every answer on the capture sheet', async () => {
    const container = render(threePanels({ defaultOpen: 'none' }), 'pdf');

    const paper = await createWhitePaperContainer(container);

    // Nothing is `hidden` and nothing was deleted, so all six strings are on
    // the page the rasteriser photographs, not merely in its DOM.
    expect(paper.querySelectorAll('.mdxstudio-accordion__panel[hidden]')).toHaveLength(0);
    expect(paper.querySelectorAll('.mdxstudio-accordion__trigger')).toHaveLength(3);
    for (const text of [
      'First question',
      'First answer.',
      'Second question',
      'Second answer.',
      'Third question',
      'Third answer.',
    ]) {
      expect(paper.textContent).toContain(text);
    }
  });

  it('is the state a live accordion would have lost', async () => {
    // The failure this exists to prevent: on screen the shut panels are right,
    // in the export the questions are deleted with their buttons and the
    // answers are display:none, so none of it is photographed.
    const container = render(threePanels({ defaultOpen: 'none' }), 'live');

    const paper = await createWhitePaperContainer(container);

    expect(paper.querySelectorAll('.mdxstudio-accordion__trigger')).toHaveLength(0);
    expect(paper.querySelectorAll('.mdxstudio-accordion__panel[hidden]')).toHaveLength(3);
  });

  it('opens the panels of a document too', () => {
    const container = renderMdx(
      [
        '<Accordion defaultOpen="none">',
        '<AccordionItem title="Buried">',
        '',
        'Something that must not vanish.',
        '',
        '</AccordionItem>',
        '</Accordion>',
        '',
      ].join('\n'),
      'pdf'
    );

    expect(container.textContent).toContain('Something that must not vanish.');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('documents that are wrong', () => {
  it('renders nothing at all rather than an empty box', () => {
    expect(render(<Accordion />).querySelector('.mdxstudio-accordion')).toBeNull();
    expect(render(<Accordion items={[]} />).querySelector('.mdxstudio-accordion')).toBeNull();
    expect(render(<Accordion>{null}</Accordion>).querySelector('.mdxstudio-accordion')).toBeNull();
  });

  it('names a panel that gave no title', () => {
    const container = render(
      <Accordion>
        <AccordionItem>No title here.</AccordionItem>
      </Accordion>
    );

    expect(titles(container)).toEqual(['Details']);
    expect(triggers(container)[0].textContent).toContain('Details');
    expect(container.textContent).toContain('No title here.');
  });

  it('keeps a child that is not a panel instead of dropping it', () => {
    const container = render(
      <Accordion>
        <p>Loose prose.</p>
        <AccordionItem title="A panel">Body.</AccordionItem>
      </Accordion>
    );

    expect(container.querySelector('.mdxstudio-accordion__loose')?.textContent).toBe(
      'Loose prose.'
    );
    expect(titles(container)).toEqual(['A panel']);
    expect(openTitles(container)).toEqual(['A panel']);
  });

  it('keeps loose prose written inside a document', () => {
    const container = renderMdx(
      [
        '<Accordion>',
        '',
        'Loose prose.',
        '',
        '<AccordionItem title="A panel">',
        '',
        'Body.',
        '',
        '</AccordionItem>',
        '</Accordion>',
        '',
      ].join('\n')
    );

    expect(container.querySelector('.mdxstudio-accordion__loose')?.textContent).toContain(
      'Loose prose.'
    );
    expect(titles(container)).toEqual(['A panel']);
  });

  it('survives junk in the items array', () => {
    const items = [null, { title: 'Real' }, 'not an item', undefined] as never;
    const container = render(<Accordion items={items} />);

    expect(titles(container)).toEqual(['Real']);
    expect(panels(container)[0].textContent).toBe('');
  });

  it('takes another component that names a title rather than losing it', () => {
    // Not what anyone should write, but a title is enough to place it.
    const container = render(
      <Accordion>
        <Callout title="A callout">Body.</Callout>
      </Accordion>
    );

    expect(titles(container)).toEqual(['A callout']);
    expect(container.textContent).toContain('Body.');
  });

  it('does not throw on an unreadable defaultOpen', () => {
    expect(() => render(threePanels({ defaultOpen: {} }))).not.toThrow();
    expect(() => render(threePanels({ defaultOpen: [null, undefined] }))).not.toThrow();
  });
});
