/**
 * The diagram card.
 *
 * The thing worth protecting here is the contract either side of the drawing.
 * The PDF exporter finds the picture through `.mermaid-svg-container > svg` and
 * strips every button before it photographs the sheet, so an export must carry
 * the diagram at its natural fit with no controls at all and that selector must
 * keep resolving. In a live document the opposite holds: the controls have to be
 * real, labelled buttons, a plain wheel has to belong to the page, and Reset has
 * to land on precisely the view the reader started from.
 *
 * Mermaid itself is mocked. This file is about the frame, not about whether
 * upstream can lay out a sequence diagram.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxRenderContext } from '@mdxstudio/core';

import { MermaidDiagram } from '../src/MermaidDiagram';
import { MERMAID_SCALE_STEP } from '../src/panZoom';

const BROKEN = 'flowchart LR\n  !!broken';

vi.mock('mermaid', () => ({
  default: {
    initialize: () => undefined,
    parse: async (code: string) => {
      if (String(code).includes('!!broken')) throw new Error('Parse error on line 2');
      return true;
    },
    render: async (id: string) => ({
      svg: `<svg id="${id}" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900"/></svg>`,
    }),
  },
}));

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    act(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

function mount(node: React.ReactNode, renderMode: 'live' | 'pdf' = 'live'): HTMLDivElement {
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

/** Lets the mocked render promise settle and React commit the result. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mountReady(
  chart = 'flowchart LR\n  A --> B',
  renderMode: 'live' | 'pdf' = 'live'
): Promise<HTMLDivElement> {
  const container = mount(<MermaidDiagram chart={chart} />, renderMode);
  await settle();
  return container;
}

function viewportOf(container: HTMLElement): HTMLElement {
  const viewport = container.querySelector<HTMLElement>('[data-mermaid-viewport]');
  if (!viewport) throw new Error('no viewport');
  return viewport;
}

function stageOf(container: HTMLElement): HTMLElement {
  const stage = container.querySelector<HTMLElement>('.mdxstudio-mermaid__stage');
  if (!stage) throw new Error('no stage');
  return stage;
}

function scaleOf(container: HTMLElement): number {
  const match = /scale\(([-\d.]+)\)/.exec(stageOf(container).style.transform);
  return match ? Number(match[1]) : NaN;
}

function offsetOf(container: HTMLElement): { x: number; y: number } {
  const match = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(stageOf(container).style.transform);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : { x: NaN, y: NaN };
}

function control(container: HTMLElement, label: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!button) throw new Error(`no control labelled ${label}`);
  return button;
}

function press(button: HTMLElement): void {
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

/** jsdom lays nothing out, so the frame is given a size by hand. */
function sizeViewport(element: HTMLElement, width = 800, height = 400): void {
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: height, configurable: true });
  element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

/** jsdom has no PointerEvent, so a MouseEvent stands in for one. */
function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
  pointerId = 1
): void {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  act(() => {
    target.dispatchEvent(event);
  });
}

function key(target: Element, name: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, shiftKey });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function wheel(target: Element, deltaY: number, ctrlKey: boolean): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    deltaY,
    ctrlKey,
    clientX: 400,
    clientY: 200,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('the live card', () => {
  it('wraps the drawing in a pannable frame and offers three labelled controls', async () => {
    const container = await mountReady();

    expect(container.querySelector('[data-mermaid-viewport]')).not.toBeNull();
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');

    const labels = Array.from(
      container.querySelectorAll('.mdxstudio-mermaid__controls button')
    ).map((button) => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Zoom out', 'Zoom in', 'Reset zoom']);

    container.querySelectorAll('.mdxstudio-mermaid__controls button').forEach((button) => {
      expect(button.getAttribute('type')).toBe('button');
      expect(button.getAttribute('title')).toBe(button.getAttribute('aria-label'));
    });
  });

  it('puts the controls in the bottom right corner of the frame, not the card', async () => {
    const container = await mountReady();
    const controls = container.querySelector('.mdxstudio-mermaid__controls');
    expect(controls?.parentElement).toBe(viewportOf(container));
  });

  it('describes the gestures for a screen reader and takes focus for the keyboard', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);

    expect(viewport.getAttribute('role')).toBe('group');
    expect(viewport.getAttribute('aria-label')).toBe('Mermaid diagram, pannable and zoomable');
    expect(viewport.getAttribute('tabindex')).toBe('0');

    const described = viewport.getAttribute('aria-describedby');
    expect(described).toBeTruthy();
    const help = document.getElementById(described as string);
    expect(help?.textContent).toMatch(/arrow keys to pan/i);
    expect(help?.textContent).toMatch(/scrolling on its own moves the page/i);
  });

  it('keeps the selector the PDF exporter reads the drawing through', async () => {
    const container = await mountReady();
    expect(container.querySelector('.mermaid-svg-container > svg')).not.toBeNull();
  });
});

describe('zooming', () => {
  it('grows the drawing one step per press and reports the percentage', async () => {
    const container = await mountReady();
    const card = container.querySelector<HTMLElement>('[data-pdf-mermaid]') as HTMLElement;
    expect(card.dataset.mermaidZoom).toBe('100');

    press(control(container, 'Zoom in'));
    expect(scaleOf(container)).toBeCloseTo(MERMAID_SCALE_STEP, 3);
    expect(card.dataset.mermaidZoom).toBe(String(Math.round(MERMAID_SCALE_STEP * 100)));

    press(control(container, 'Zoom in'));
    expect(scaleOf(container)).toBeCloseTo(MERMAID_SCALE_STEP ** 2, 3);
  });

  it('will not shrink a diagram that is already fitted', async () => {
    const container = await mountReady();
    press(control(container, 'Zoom out'));
    press(control(container, 'Zoom out'));
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('returns to exactly the starting fit on reset, from anywhere', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    for (let press_ = 0; press_ < 4; press_ += 1) press(control(container, 'Zoom in'));
    pointer(viewport, 'pointerdown', 400, 200);
    pointer(viewport, 'pointermove', 120, 40);
    pointer(viewport, 'pointerup', 120, 40);
    expect(stageOf(container).style.transform).not.toBe('translate(0px, 0px) scale(1)');

    press(control(container, 'Reset zoom'));
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('marks the frame pannable only once there is something outside it', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    expect(viewport.className).not.toMatch(/--pannable/);

    press(control(container, 'Zoom in'));
    expect(viewport.className).toMatch(/--pannable/);

    press(control(container, 'Reset zoom'));
    expect(viewport.className).not.toMatch(/--pannable/);
  });
});

describe('the wheel', () => {
  it('leaves a plain wheel to the page', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    const event = wheel(viewport, -240, false);
    expect(event.defaultPrevented).toBe(false);
    expect(scaleOf(container)).toBe(1);
  });

  it('zooms only on the Ctrl chord, and takes the gesture when it does', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    const event = wheel(viewport, -240, true);
    expect(event.defaultPrevented).toBe(true);
    expect(scaleOf(container)).toBeGreaterThan(1);
  });
});

describe('the keyboard', () => {
  it('zooms with plus and minus and resets with zero', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    key(viewport, '+');
    key(viewport, '+');
    expect(scaleOf(container)).toBeCloseTo(MERMAID_SCALE_STEP ** 2, 3);

    key(viewport, '-');
    expect(scaleOf(container)).toBeCloseTo(MERMAID_SCALE_STEP, 3);

    key(viewport, '0');
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('pans with the arrow keys once zoomed, three steps at a time with Shift', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    key(viewport, '+');
    key(viewport, '+');
    const start = offsetOf(container);

    key(viewport, 'ArrowRight');
    const oneStep = start.x - offsetOf(container).x;
    expect(oneStep).toBeGreaterThan(0);

    const afterOne = offsetOf(container).x;
    key(viewport, 'ArrowRight', true);
    expect(afterOne - offsetOf(container).x).toBeCloseTo(oneStep * 3, 3);

    key(viewport, 'ArrowLeft', true);
    expect(offsetOf(container).x).toBeCloseTo(afterOne, 3);
  });

  it('leaves the arrow keys to the page while there is nothing to pan', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    const event = key(viewport, 'ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });
});

describe('dragging', () => {
  it('pans the drawing by the distance the pointer travelled', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    press(control(container, 'Zoom in'));
    press(control(container, 'Zoom in'));
    const start = offsetOf(container);

    pointer(viewport, 'pointerdown', 500, 250);
    pointer(viewport, 'pointermove', 460, 230);
    expect(offsetOf(container).x).toBeCloseTo(start.x - 40, 3);
    expect(offsetOf(container).y).toBeCloseTo(start.y - 20, 3);

    pointer(viewport, 'pointerup', 460, 230);
    // The pointer moving on after release is no longer the diagram's business.
    pointer(viewport, 'pointermove', 100, 100);
    expect(offsetOf(container).x).toBeCloseTo(start.x - 40, 3);
  });

  it('does not start a drag on a diagram nobody has zoomed', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    pointer(viewport, 'pointerdown', 500, 250);
    expect(viewport.className).not.toMatch(/--dragging/);
    pointer(viewport, 'pointermove', 200, 100);
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('measures from the start of the drag, so an edge does not eat the way back', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    press(control(container, 'Zoom in'));
    const start = offsetOf(container);

    pointer(viewport, 'pointerdown', 400, 200);
    pointer(viewport, 'pointermove', 4000, 200); // far past the clamp
    pointer(viewport, 'pointermove', 400, 200); // and straight back
    expect(offsetOf(container).x).toBeCloseTo(start.x, 3);
  });

  it('marks the frame while a drag is under way and clears it afterwards', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    press(control(container, 'Zoom in'));
    pointer(viewport, 'pointerdown', 400, 200);
    expect(viewport.className).toMatch(/--dragging/);
    pointer(viewport, 'pointerup', 400, 200);
    expect(viewport.className).not.toMatch(/--dragging/);
  });

  it('pinches two pointers into a zoom, and hands the drag to the finger left behind', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    pointer(viewport, 'pointerdown', 380, 200, 1);
    pointer(viewport, 'pointerdown', 420, 200, 2);
    expect(viewport.className).not.toMatch(/--dragging/);

    // Fingers spread from 40px apart to 120px: three times the scale.
    pointer(viewport, 'pointermove', 340, 200, 1);
    pointer(viewport, 'pointermove', 460, 200, 2);
    expect(scaleOf(container)).toBeCloseTo(3, 2);

    pointer(viewport, 'pointerup', 340, 200, 1);
    expect(viewport.className).toMatch(/--dragging/);

    const held = offsetOf(container);
    pointer(viewport, 'pointermove', 400, 180, 2);
    expect(offsetOf(container).x).toBeCloseTo(held.x - 60, 3);

    pointer(viewport, 'pointerup', 400, 180, 2);
    expect(viewport.className).not.toMatch(/--dragging/);
  });

  it('ignores a press on the controls, so a click is not read as a drag', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport);

    press(control(container, 'Zoom in'));
    pointer(control(container, 'Zoom in'), 'pointerdown', 700, 380);
    expect(viewport.className).not.toMatch(/--dragging/);
  });
});

describe('the export', () => {
  it('renders no controls and no frame at all', async () => {
    const container = await mountReady('flowchart LR\n  A --> B', 'pdf');

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-mermaid-viewport]')).toBeNull();
    expect(container.querySelector('.mdxstudio-mermaid__stage')).toBeNull();
    expect(container.querySelector('.mdxstudio-mermaid__controls')).toBeNull();
  });

  it('leaves the drawing at its natural fit, where the exporter looks for it', async () => {
    const container = await mountReady('flowchart LR\n  A --> B', 'pdf');
    const svgContainer = container.querySelector('.mermaid-svg-container');

    expect(svgContainer?.parentElement?.className).toContain('mdxstudio-mermaid__canvas');
    expect(container.querySelector('.mermaid-svg-container > svg')).not.toBeNull();
    expect(container.querySelector<HTMLElement>('[data-pdf-mermaid]')?.dataset.mermaidZoom).toBeUndefined();
  });

  it('takes the mode from the prop as well as the context', async () => {
    const container = mount(<MermaidDiagram chart="flowchart LR\n  A --> B" renderMode="pdf" />, 'live');
    await settle();
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[data-mermaid-viewport]')).toBeNull();
  });
});

describe('degenerate cases', () => {
  it('renders nothing for an empty fence', () => {
    const container = mount(<MermaidDiagram chart="   " />);
    expect(container.innerHTML).toBe('');
    expect(container.querySelector('[data-pdf-mermaid]')).toBeNull();
  });

  it('shows the parser error card and no controls when the diagram will not parse', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const container = await mountReady(BROKEN);

    const card = container.querySelector<HTMLElement>('[data-pdf-mermaid]') as HTMLElement;
    expect(card.dataset.renderState).toBe('error');
    expect(card.dataset.mermaidError).toBe('true');
    expect(container.querySelector('[data-mermaid-error-message]')?.textContent).toMatch(
      /Parse error on line 2/
    );
    expect(container.querySelector('.mdxstudio-mermaid__controls')).toBeNull();
    expect(container.querySelector('[data-mermaid-viewport]')).toBeNull();
  });

  it('zooms without throwing or emitting NaN inside a zero-width container', async () => {
    const container = await mountReady();
    const viewport = viewportOf(container);
    sizeViewport(viewport, 0, 0);

    expect(() => {
      press(control(container, 'Zoom in'));
      press(control(container, 'Zoom in'));
      pointer(viewport, 'pointerdown', 0, 0);
      pointer(viewport, 'pointermove', -40, -40);
      pointer(viewport, 'pointerup', -40, -40);
      key(viewport, 'ArrowRight');
      wheel(viewport, -120, true);
      press(control(container, 'Reset zoom'));
    }).not.toThrow();

    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('returns to the fit when the document swaps the diagram out underneath it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    const render = (chart: string) =>
      act(() => {
        root.render(
          <MdxRenderContext.Provider value={{ renderMode: 'live', themeCategory: 'light' }}>
            <MermaidDiagram chart={chart} />
          </MdxRenderContext.Provider>
        );
      });

    render('flowchart LR\n  A --> B');
    await settle();
    press(control(container, 'Zoom in'));
    press(control(container, 'Zoom in'));
    expect(scaleOf(container)).toBeGreaterThan(1);

    render('flowchart LR\n  C --> D');
    await settle();
    expect(stageOf(container).style.transform).toBe('translate(0px, 0px) scale(1)');
  });

  it('reads the diagram out of children when there is no chart prop', async () => {
    const container = mount(<MermaidDiagram>{'flowchart LR\n  A --> B'}</MermaidDiagram>);
    await settle();
    expect(container.querySelector('.mermaid-svg-container > svg')).not.toBeNull();
    expect(container.querySelector('[data-mermaid-viewport]')).not.toBeNull();
  });
});
