/**
 * The split.
 *
 * What is load-bearing here is not "two boxes appear".
 *
 * - Pane content is children, so a fence written in a pane is a fence. The
 *   accordion shipped once with content as a prop and silently flattened every
 *   document that used it; one test runs a real document through the parser to
 *   make sure that cannot happen again.
 * - The ratio is arithmetic, and arithmetic is where a split view breaks: a
 *   drag must move only the two panes it separates, a clamp must hold, and a
 *   ratio nobody can read must land on equal panes rather than throwing.
 * - The PDF pass deletes every button and photographs a fixed 794px sheet. A
 *   comparison that arrives there as one column of unlabelled content has lost
 *   the thing it was for, and one squeezed into ribbons is no better.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxRenderContext } from '@mdxstudio/core';
import { createWhitePaperContainer } from '@mdxstudio/pdf';
import {
  Callout,
  Pane,
  Split,
  baseMdxAliases,
  baseMdxComponents,
  moveSplitBoundary,
  normaliseSplitShares,
  splitBoundaryPosition,
  splitPointerPosition,
} from '../src/CustomComponents';
import { MdxRenderer } from '../src/MdxRenderer';
import { THEMES } from '../src/themes';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const theme = THEMES['github-light'];
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

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

/** Mounts a real document, so the panes come out of the MDX parser. */
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

const track = (container: HTMLElement): HTMLElement =>
  container.querySelector<HTMLElement>('.mdxstudio-split')!;

const panes = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-split__pane'));

const dividers = (container: HTMLElement): HTMLElement[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-split__divider'));

const titles = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll<HTMLElement>('.mdxstudio-split__title')).map(
    (title) => title.textContent ?? ''
  );

/** The share each pane was given, rounded so the assertions stay readable. */
const shares = (container: HTMLElement): number[] =>
  panes(container).map((pane) =>
    Math.round(Number(pane.style.getPropertyValue('--mdxstudio-split-share')))
  );

const press = (element: HTMLElement, key: string, shiftKey = false) =>
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
  });

/** jsdom lays nothing out, so the two measurements a drag reads are supplied. */
function measure(container: HTMLElement, box: { left: number; width: number }, gutter = 12) {
  const element = track(container);
  element.getBoundingClientRect = () =>
    ({
      left: box.left,
      top: 0,
      width: box.width,
      height: 400,
      right: box.left + box.width,
      bottom: 400,
      x: box.left,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;

  for (const divider of dividers(container)) {
    Object.defineProperty(divider, 'offsetWidth', { configurable: true, value: gutter });
    Object.defineProperty(divider, 'offsetHeight', { configurable: true, value: gutter });
  }
}

/**
 * A pointer event jsdom will carry. `PointerEvent` is not implemented there, and
 * React dispatches on the event *name*, so a mouse event under that name reaches
 * the same handler the browser would.
 */
const pointer = (element: HTMLElement, type: string, clientX = 0, clientY = 0) =>
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    element.dispatchEvent(event);
  });

function twoPanes(props: Record<string, unknown> = {}) {
  return (
    <Split {...props}>
      <Pane title="Before">Alpha.</Pane>
      <Pane title="After">Beta.</Pane>
    </Split>
  );
}

function threePanes(props: Record<string, unknown> = {}) {
  return (
    <Split {...props}>
      <Pane title="One">Alpha.</Pane>
      <Pane title="Two">Beta.</Pane>
      <Pane title="Three">Gamma.</Pane>
    </Split>
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

describe('panes are children', () => {
  it('turns each Pane into a pane with a header', () => {
    const container = render(twoPanes());

    expect(panes(container)).toHaveLength(2);
    expect(titles(container)).toEqual(['Before', 'After']);
    expect(container.textContent).toContain('Alpha.');
    expect(container.textContent).toContain('Beta.');
  });

  it('parses markdown inside a pane', () => {
    // The whole reason content is children: a pane goes through the MDX
    // pipeline, so a fence is a fence, a list is a list, a component is one.
    const container = renderMdx(
      [
        '<Split>',
        '',
        '<Pane title="Before">',
        '',
        'A paragraph with **bold** in it.',
        '',
        '- first',
        '- second',
        '',
        '```ts',
        'const x = 1;',
        '```',
        '',
        '<Callout type="warning" title="Nested">Mind the gap.</Callout>',
        '',
        '</Pane>',
        '',
        '<Pane title="After">',
        '',
        '```ts',
        'const x: number = 1;',
        '```',
        '',
        '</Pane>',
        '',
        '</Split>',
        '',
      ].join('\n')
    );

    const [before, after] = panes(container);
    expect(titles(container)).toEqual(['Before', 'After']);
    expect(before.querySelector('strong')?.textContent).toBe('bold');
    expect(before.querySelectorAll('.mdxstudio-li')).toHaveLength(2);
    expect(before.querySelector('pre')?.textContent).toContain('const x = 1;');
    expect(before.querySelector('.mdxstudio-callout--warning')).not.toBeNull();
    expect(after.querySelector('pre')?.textContent).toContain('const x: number = 1;');
  });

  it('groups panes written without a blank line between them', () => {
    // The parser makes one paragraph of those, which would otherwise leave a row
    // of one-pane splits inside a stray block.
    const container = renderMdx(
      [
        '<Split>',
        '<Pane title="One">Alpha.</Pane>',
        '<Pane title="Two">Beta.</Pane>',
        '</Split>',
        '',
      ].join('\n')
    );

    expect(container.querySelectorAll('.mdxstudio-split')).toHaveLength(1);
    expect(titles(container)).toEqual(['One', 'Two']);
  });

  it('takes the icon and badge Card already takes', () => {
    const container = render(
      <Split>
        <Pane title="Before" icon="Ban" badge="v1">
          Alpha.
        </Pane>
        <Pane title="After" icon="Check" badge="v2">
          Beta.
        </Pane>
      </Split>
    );

    expect(container.querySelectorAll('.mdxstudio-split__icon')).toHaveLength(2);
    expect(
      Array.from(container.querySelectorAll('.mdxstudio-split__badge')).map((b) => b.textContent)
    ).toEqual(['v1', 'v2']);
  });

  it('is registered, with Compare as its other name', () => {
    expect(baseMdxComponents.Split).toBe(Split);
    expect(baseMdxComponents.Pane).toBe(Pane);
    expect(baseMdxAliases.Compare).toBe('Split');

    const container = renderMdx(
      ['<Compare>', '', '<Pane title="Left">Alpha.</Pane>', '', '</Compare>', ''].join('\n')
    );

    expect(titles(container)).toEqual(['Left']);
  });
});

describe('both axes', () => {
  it('puts the panes in a row by default, with a vertical separator', () => {
    const container = render(twoPanes());

    expect(track(container).className).toContain('mdxstudio-split--row');
    expect(dividers(container)[0].getAttribute('aria-orientation')).toBe('vertical');
    // No height of its own: a row grows with its content.
    expect(track(container).className).not.toContain('mdxstudio-split--sized');
  });

  it('stacks them on direction="column", with a horizontal separator', () => {
    const container = render(twoPanes({ direction: 'column' }));

    expect(track(container).className).toContain('mdxstudio-split--column');
    expect(dividers(container)[0].getAttribute('aria-orientation')).toBe('horizontal');
    // A column has no content along its main axis to be sized by, so it is
    // given a height - otherwise its divider has nothing to move.
    expect(track(container).className).toContain('mdxstudio-split--sized');
    expect(track(container).style.getPropertyValue('--mdxstudio-split-height')).toBe('24rem');
  });

  it('takes a height on either axis, and reads auto as none', () => {
    expect(
      track(render(twoPanes({ height: 300 }))).style.getPropertyValue('--mdxstudio-split-height')
    ).toBe('300px');
    expect(
      track(render(twoPanes({ height: '40vh' }))).style.getPropertyValue('--mdxstudio-split-height')
    ).toBe('40vh');
    expect(track(render(twoPanes({ direction: 'column', height: 'auto' }))).className).not.toContain(
      'mdxstudio-split--sized'
    );
  });

  it('reads a direction it does not know as a row rather than failing', () => {
    // `horizontal` is exactly the word the API avoids, because it names the
    // divider to some readers and the panes to others.
    expect(track(render(twoPanes({ direction: 'horizontal' }))).className).toContain(
      'mdxstudio-split--row'
    );
    expect(track(render(twoPanes({ direction: 42 }))).className).toContain('mdxstudio-split--row');
  });
});

describe('more than two panes', () => {
  it('draws a divider between each neighbouring pair', () => {
    const container = render(threePanes());

    expect(panes(container)).toHaveLength(3);
    expect(dividers(container)).toHaveLength(2);
    expect(shares(container)).toEqual([33, 33, 33]);
  });

  it('moves only the two panes a divider separates', () => {
    const container = render(threePanes());
    const [first] = dividers(container);

    press(first, 'ArrowRight', true);

    const [a, b, c] = shares(container);
    expect(a).toBe(43);
    expect(b).toBe(23);
    expect(c).toBe(33);
  });
});

describe('the ratio', () => {
  it('reads a list of weights, however it is spelled', () => {
    expect(shares(render(twoPanes({ ratio: '60/40' })))).toEqual([60, 40]);
    expect(shares(render(twoPanes({ ratio: '2:1' })))).toEqual([67, 33]);
    expect(shares(render(twoPanes({ ratio: '3 1' })))).toEqual([75, 25]);
    expect(shares(render(twoPanes({ ratio: [1, 3] })))).toEqual([25, 75]);
    expect(shares(render(threePanes({ ratio: '2:1:1' })))).toEqual([50, 25, 25]);
  });

  it('reads a single number as the first pane"s percentage', () => {
    expect(shares(render(twoPanes({ ratio: 70 })))).toEqual([70, 30]);
    expect(shares(render(threePanes({ ratio: 60 })))).toEqual([60, 20, 20]);
  });

  it('clamps a pane that would be too narrow to read', () => {
    expect(shares(render(twoPanes({ ratio: '99/1' })))).toEqual([90, 10]);
    expect(shares(render(twoPanes({ ratio: 100 })))).toEqual([90, 10]);
    expect(shares(render(threePanes({ ratio: '98:1:1' })))).toEqual([80, 10, 10]);
  });

  it('falls back to equal panes on a ratio nobody can read', () => {
    for (const ratio of ['', 'wide/narrow', '0/0', '-1/-2', {}, NaN, null, [null, undefined]]) {
      expect(shares(render(twoPanes({ ratio })))).toEqual([50, 50]);
    }
  });

  it('gives the panes a ratio forgot the average of the ones it named', () => {
    // A document that gained a pane without updating its ratio still renders.
    expect(shares(render(threePanes({ ratio: '3:1' })))).toEqual([50, 17, 33]);
  });

  it('normalises the arithmetic on its own', () => {
    expect(normaliseSplitShares(undefined, 0)).toEqual([]);
    expect(normaliseSplitShares('80/20', 1)).toEqual([100]);
    expect(normaliseSplitShares('1:1:1:1', 4)).toEqual([25, 25, 25, 25]);
    expect(normaliseSplitShares(undefined, 4).reduce((sum, s) => sum + s, 0)).toBeCloseTo(100);
    // Ten panes cannot all clear the floor, so nothing is favoured.
    expect(normaliseSplitShares('90/1/1/1/1/1/1/1/1/1', 10)).toEqual(new Array(10).fill(10));
  });
});

describe('the drag', () => {
  it('is arithmetic on the shares, not on the DOM', () => {
    expect(splitBoundaryPosition([60, 40], 0)).toBe(60);
    expect(splitBoundaryPosition([50, 30, 20], 1)).toBe(80);

    expect(moveSplitBoundary([50, 50], 0, 70)).toEqual([70, 30]);
    // The pair keeps its total, so the third pane is untouched.
    expect(moveSplitBoundary([40, 40, 20], 0, 25)).toEqual([25, 55, 20]);
    expect(moveSplitBoundary([40, 40, 20], 1, 70)).toEqual([40, 30, 30]);

    // Clamped at both ends of the pair, never past it.
    expect(moveSplitBoundary([50, 50], 0, 200)).toEqual([90, 10]);
    expect(moveSplitBoundary([50, 50], 0, -50)).toEqual([10, 90]);

    // Nothing to move, or nothing to move it to.
    expect(moveSplitBoundary([100], 0, 50)).toEqual([100]);
    expect(moveSplitBoundary([50, 50], 5, 50)).toEqual([50, 50]);
    expect(moveSplitBoundary([50, 50], 0, NaN)).toEqual([50, 50]);
  });

  it('measures against the space the panes share, not the whole track', () => {
    // 400px of track with one 12px divider in it is 388px of panes, and the
    // boundary the pointer is on has none of them before it.
    expect(
      splitPointerPosition({
        point: 294,
        start: 100,
        extent: 400,
        dividerSize: 12,
        dividers: 1,
        before: 0,
      })
    ).toBeCloseTo(50);

    // The second divider of a three-pane track: one divider stands before it.
    expect(
      splitPointerPosition({
        point: 100 + 12 + 376,
        start: 100,
        extent: 400,
        dividerSize: 12,
        dividers: 2,
        before: 1,
      })
    ).toBeCloseTo(100);

    // A track that has not been laid out yet.
    expect(
      splitPointerPosition({ point: 0, start: 0, extent: 0, dividerSize: 12, dividers: 1, before: 0 })
    ).toBeNull();
  });

  it('moves the boundary a pointer drags', () => {
    const container = render(twoPanes());
    measure(container, { left: 100, width: 400 });

    const [divider] = dividers(container);
    pointer(divider, 'pointerdown', 294);
    pointer(divider, 'pointermove', 391); // 75% of the 388px the panes share
    pointer(divider, 'pointerup', 391);

    expect(shares(container)).toEqual([75, 25]);
  });

  it('ignores a move that never started with a press', () => {
    const container = render(twoPanes());
    measure(container, { left: 100, width: 400 });

    pointer(dividers(container)[0], 'pointermove', 391);

    expect(shares(container)).toEqual([50, 50]);
  });

  it('does not persist: a fresh split starts where the document said', () => {
    const first = render(twoPanes({ ratio: '60/40' }));
    measure(first, { left: 0, width: 400 });
    pointer(dividers(first)[0], 'pointerdown', 0);
    pointer(dividers(first)[0], 'pointermove', 100);
    pointer(dividers(first)[0], 'pointerup', 100);
    expect(shares(first)).not.toEqual([60, 40]);

    expect(shares(render(twoPanes({ ratio: '60/40' })))).toEqual([60, 40]);
  });
});

describe('the keyboard', () => {
  it('moves the boundary with the arrow keys', () => {
    const container = render(twoPanes());
    const [divider] = dividers(container);

    press(divider, 'ArrowRight');
    expect(shares(container)).toEqual([52, 48]);

    press(divider, 'ArrowLeft');
    press(divider, 'ArrowLeft');
    expect(shares(container)).toEqual([48, 52]);
  });

  it('takes a bigger step with Shift, and answers both axes', () => {
    const container = render(twoPanes({ direction: 'column' }));
    const [divider] = dividers(container);

    press(divider, 'ArrowDown', true);
    expect(shares(container)).toEqual([60, 40]);

    press(divider, 'ArrowUp', true);
    expect(shares(container)).toEqual([50, 50]);
  });

  it('stops at the clamp instead of running past it', () => {
    const container = render(twoPanes());
    const [divider] = dividers(container);

    for (let press_ = 0; press_ < 10; press_ += 1) press(divider, 'ArrowRight', true);

    expect(shares(container)).toEqual([90, 10]);
  });

  it('puts the ratio back on Home', () => {
    const container = render(twoPanes({ ratio: '70/30' }));
    const [divider] = dividers(container);

    press(divider, 'ArrowLeft', true);
    expect(shares(container)).toEqual([60, 40]);

    press(divider, 'Home');
    expect(shares(container)).toEqual([70, 30]);
  });

  it('leaves other keys to the browser', () => {
    const container = render(twoPanes());
    press(dividers(container)[0], 'Tab');

    expect(shares(container)).toEqual([50, 50]);
  });
});

describe('the separator', () => {
  it('is focusable and says where it is', () => {
    const container = render(twoPanes({ ratio: '60/40' }));
    const [divider] = dividers(container);

    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.getAttribute('aria-valuenow')).toBe('60');
    expect(divider.getAttribute('aria-valuemin')).toBe('10');
    expect(divider.getAttribute('aria-valuemax')).toBe('90');
    expect(divider.tabIndex).toBe(0);
    expect(divider.getAttribute('aria-label')).toBe('Resize Before and After');
  });

  it('keeps aria-valuenow in step with the panes', () => {
    const container = render(twoPanes());
    const [divider] = dividers(container);

    press(divider, 'ArrowRight', true);

    expect(divider.getAttribute('aria-valuenow')).toBe('60');
  });

  it('reports the range of the pair it sits in, not of the whole split', () => {
    const container = render(threePanes());
    const [, second] = dividers(container);

    // Panes two and three share the last 66.7%, which starts at 33.3%.
    expect(second.getAttribute('aria-valuenow')).toBe('67');
    expect(second.getAttribute('aria-valuemin')).toBe('43');
    expect(second.getAttribute('aria-valuemax')).toBe('90');
  });

  it('names panes by number when they have no titles', () => {
    const container = render(
      <Split>
        <Pane>Alpha.</Pane>
        <Pane>Beta.</Pane>
      </Split>
    );

    expect(dividers(container)[0].getAttribute('aria-label')).toBe('Resize panes 1 and 2');
  });
});

describe('the PDF export', () => {
  it('deletes no content, because there is no button to delete', () => {
    const container = render(twoPanes(), 'pdf');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(panes(container)).toHaveLength(2);
    expect(container.textContent).toContain('Alpha.');
    expect(container.textContent).toContain('Beta.');
  });

  it('leaves the separator on the page but takes it out of the tab order', () => {
    const container = render(twoPanes(), 'pdf');
    const [divider] = dividers(container);

    expect(divider.getAttribute('role')).toBe('separator');
    expect(divider.getAttribute('aria-orientation')).toBe('vertical');
    expect(divider.hasAttribute('tabindex')).toBe(false);
    expect(divider.hasAttribute('aria-valuenow')).toBe(false);
  });

  it('keeps two panes side by side, where an A4 sheet has room for them', () => {
    // A split is 650px on the sheet and one divider takes 12 of them, so an
    // even pair is 319px each - above the floor, and worth printing as a pair.
    expect(track(render(twoPanes(), 'pdf')).className).toContain('mdxstudio-split--row');
    expect(track(render(twoPanes(), 'pdf')).className).toContain('mdxstudio-split--pdf');
    // 60/40, the ratio a before-and-after is usually written at: 255px, which
    // still clears it.
    expect(track(render(twoPanes({ ratio: '60/40' }), 'pdf')).className).toContain(
      'mdxstudio-split--row'
    );
  });

  it('stacks three, which would be ribbons at that width', () => {
    // 209px each once the two dividers are out.
    const container = render(threePanes(), 'pdf');

    expect(track(container).className).toContain('mdxstudio-split--column');
    expect(titles(container)).toEqual(['One', 'Two', 'Three']);
  });

  it('stacks a lopsided ratio too, rather than printing a sliver', () => {
    // 30% of 638px is 191px, and 20% is 128px. Nothing readable fits in either.
    expect(track(render(twoPanes({ ratio: '70/30' }), 'pdf')).className).toContain(
      'mdxstudio-split--column'
    );
    expect(track(render(twoPanes({ ratio: '80/20' }), 'pdf')).className).toContain(
      'mdxstudio-split--column'
    );
  });

  it('numbers the panes it has to stack when the document named none', () => {
    // A stacked export loses the thing that told the panes apart. Unlabelled
    // columns of content are what this component exists not to produce.
    const container = render(
      <Split>
        <Pane>Alpha.</Pane>
        <Pane>Beta.</Pane>
        <Pane>Gamma.</Pane>
      </Split>,
      'pdf'
    );

    expect(titles(container)).toEqual(['Pane 1', 'Pane 2', 'Pane 3']);
  });

  it('leaves them anonymous on screen, where they sit side by side', () => {
    const container = render(
      <Split>
        <Pane>Alpha.</Pane>
        <Pane>Beta.</Pane>
      </Split>
    );

    expect(titles(container)).toEqual([]);
  });

  it('has no height to scroll inside, so nothing is cut off the sheet', () => {
    const container = render(twoPanes({ direction: 'column', height: 200 }), 'pdf');

    expect(track(container).className).not.toContain('mdxstudio-split--sized');
    expect(track(container).style.getPropertyValue('--mdxstudio-split-height')).toBe('');
  });

  it('keeps every pane on the capture sheet', async () => {
    const container = render(threePanes(), 'pdf');

    const paper = await createWhitePaperContainer(container);

    expect(paper.querySelectorAll('.mdxstudio-split__pane')).toHaveLength(3);
    for (const text of ['One', 'Alpha.', 'Two', 'Beta.', 'Three', 'Gamma.']) {
      expect(paper.textContent).toContain(text);
    }
  });

  it('exports a document the same way', () => {
    const container = renderMdx(
      [
        '<Split ratio="60/40">',
        '',
        '<Pane title="Before">',
        '',
        '```ts',
        'const x = 1;',
        '```',
        '',
        '</Pane>',
        '',
        '<Pane title="After">',
        '',
        '```ts',
        'const x: number = 1;',
        '```',
        '',
        '</Pane>',
        '',
        '</Split>',
        '',
      ].join('\n'),
      'pdf'
    );

    // The split's own chrome has no button in it. The two the fences carry are
    // the code block's copy affordance, which the exporter deletes without
    // taking any of the code with it.
    expect(
      container.querySelectorAll('.mdxstudio-split__divider button, .mdxstudio-split__head button')
    ).toHaveLength(0);
    expect(dividers(container)[0].tagName).toBe('DIV');
    expect(titles(container)).toEqual(['Before', 'After']);
    expect(container.textContent).toContain('const x = 1;');
    expect(container.textContent).toContain('const x: number = 1;');
  });
});

describe('documents that are wrong', () => {
  it('renders nothing at all rather than an empty box', () => {
    expect(render(<Split />).querySelector('.mdxstudio-split')).toBeNull();
    expect(render(<Split>{null}</Split>).querySelector('.mdxstudio-split')).toBeNull();
    expect(render(<Split>{'   '}</Split>).querySelector('.mdxstudio-split')).toBeNull();
  });

  it('renders one pane with nothing to divide it from', () => {
    const container = render(
      <Split>
        <Pane title="On its own">Alpha.</Pane>
      </Split>
    );

    expect(panes(container)).toHaveLength(1);
    expect(dividers(container)).toHaveLength(0);
    expect(shares(container)).toEqual([100]);
  });

  it('renders a lone Pane as a one-pane split', () => {
    const container = render(<Pane title="On its own">Alpha.</Pane>);

    expect(titles(container)).toEqual(['On its own']);
    expect(container.textContent).toContain('Alpha.');
  });

  it('makes a pane of a child that is not one, rather than dropping it', () => {
    const container = render(
      <Split>
        <p>Loose prose.</p>
        <Pane title="A pane">Alpha.</Pane>
      </Split>
    );

    expect(panes(container)).toHaveLength(2);
    expect(container.textContent).toContain('Loose prose.');
    expect(titles(container)).toEqual(['A pane']);
  });

  it('places another component that names a title rather than losing it', () => {
    const container = render(
      <Split>
        <Callout title="A callout">Alpha.</Callout>
        <Pane title="A pane">Beta.</Pane>
      </Split>
    );

    expect(titles(container)).toEqual(['A callout', 'A pane']);
  });

  it('does not throw on any of it', () => {
    expect(() => render(<Split ratio={{} as never} direction={null as never} />)).not.toThrow();
    expect(() =>
      render(
        <Split ratio={[Infinity, 'x'] as never} height={-5}>
          <Pane title="One">Alpha.</Pane>
          <Pane title="Two">Beta.</Pane>
        </Split>
      )
    ).not.toThrow();
    expect(() => render(<Split>{[undefined, false, 0]}</Split>)).not.toThrow();
  });
});
