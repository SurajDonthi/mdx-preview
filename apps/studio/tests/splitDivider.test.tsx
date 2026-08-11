/**
 * The divider, driven by pointer and keyboard the way a reader drives it.
 *
 * jsdom lays nothing out and has no PointerEvent, so the row's bounds are
 * stubbed and the events are built from MouseEvent - which carries the
 * `clientX` this actually reads. What is being tested is the arithmetic and the
 * wiring around it, both of which are ours; the painting is checked in a
 * browser.
 */

import React, { act, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  SplitDivider,
  clampSplit,
  splitPercentAt,
  DEFAULT_SPLIT_PERCENT,
  MIN_SPLIT_PERCENT,
  MAX_SPLIT_PERCENT,
} from '../src/components/SplitDivider';

const ROW = { left: 100, width: 1000 };

let container: HTMLDivElement;
let root: Root;
let percent: number;

function Harness() {
  const rowRef = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(DEFAULT_SPLIT_PERCENT);
  const [dragging, setDragging] = useState(false);
  percent = value;

  return (
    <div
      ref={(node) => {
        if (!node) return;
        rowRef.current = node;
        node.getBoundingClientRect = () =>
          ({ left: ROW.left, width: ROW.width, top: 0, height: 800 }) as DOMRect;
      }}
    >
      <SplitDivider
        percent={value}
        isDragging={dragging}
        onDraggingChange={setDragging}
        onPercentChange={setValue}
        rowRef={rowRef}
      />
    </div>
  );
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));

  // The divider measures itself to place the grip; jsdom reports nothing.
  divider().getBoundingClientRect = () =>
    ({ left: 550, width: 8, top: 0, height: 800 }) as DOMRect;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const divider = () => container.querySelector('[role="separator"]') as HTMLElement;
const grip = () => divider().lastElementChild as HTMLElement;

/**
 * jsdom has no PointerEvent; MouseEvent carries everything this reads. React
 * synthesises onPointerEnter from pointerover, which is why the enter cases
 * dispatch that rather than the non-bubbling pointerenter.
 */
function pointer(type: string, init: { clientX?: number; clientY?: number } = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  return event;
}

function drag(toClientX: number) {
  const node = divider();
  act(() => {
    node.dispatchEvent(pointer('pointerdown', { clientX: 550, clientY: 400 }));
  });
  act(() => {
    node.dispatchEvent(pointer('pointermove', { clientX: toClientX, clientY: 400 }));
  });
  act(() => {
    node.dispatchEvent(pointer('pointerup', { clientX: toClientX, clientY: 400 }));
  });
}

describe('dragging the divider', () => {
  it('moves the boundary to where the pointer was released', () => {
    // 400px into a 1000px row that starts at 100.
    drag(500);

    expect(percent).toBe(40);
  });

  it('does nothing until the pointer goes down', () => {
    act(() => {
      divider().dispatchEvent(pointer('pointermove', { clientX: 900, clientY: 400 }));
    });

    expect(percent).toBe(DEFAULT_SPLIT_PERCENT);
  });

  it('stops moving once the pointer is released', () => {
    drag(500);
    act(() => {
      divider().dispatchEvent(pointer('pointermove', { clientX: 900, clientY: 400 }));
    });

    expect(percent).toBe(40);
  });

  it('will not let either pane be dragged out of existence', () => {
    drag(-5000);
    expect(percent).toBe(MIN_SPLIT_PERCENT);

    drag(5000);
    expect(percent).toBe(MAX_SPLIT_PERCENT);
  });

  it('reports the drag so the panes can stop selecting text', () => {
    const node = divider();
    act(() => node.dispatchEvent(pointer('pointerdown', { clientX: 550, clientY: 400 })));
    expect(node.className).toContain('z-10');
    expect(grip().className).toContain('opacity-100');

    act(() => node.dispatchEvent(pointer('pointerup', { clientX: 550, clientY: 400 })));
    expect(grip().className).toContain('opacity-0');
  });

  it('gives up the drag when the pointer is cancelled', () => {
    const node = divider();
    act(() => node.dispatchEvent(pointer('pointerdown', { clientX: 550, clientY: 400 })));
    act(() => node.dispatchEvent(pointer('pointercancel', { clientX: 550, clientY: 400 })));
    act(() => node.dispatchEvent(pointer('pointermove', { clientX: 900, clientY: 400 })));

    expect(percent).toBe(DEFAULT_SPLIT_PERCENT);
  });

  it('brings the grip to the pointer rather than leaving it centred', () => {
    act(() => {
      divider().dispatchEvent(pointer('pointerover', { clientX: 550, clientY: 240 }));
    });
    expect(grip().style.top).toBe('240px');

    act(() => {
      divider().dispatchEvent(pointer('pointermove', { clientX: 550, clientY: 690 }));
    });
    expect(grip().style.top).toBe('690px');
  });

  it('keeps the grip inside the divider when the pointer runs past either end', () => {
    act(() => divider().dispatchEvent(pointer('pointerover', { clientX: 550, clientY: -300 })));
    expect(grip().style.top).toBe('0px');

    act(() => divider().dispatchEvent(pointer('pointerover', { clientX: 550, clientY: 4000 })));
    expect(grip().style.top).toBe('800px');
  });
});

describe('the divider from the keyboard', () => {
  const press = (key: string, shiftKey = false) =>
    act(() => {
      divider().dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    });

  it('moves in steps, and in bigger steps with shift', () => {
    press('ArrowRight');
    expect(percent).toBe(DEFAULT_SPLIT_PERCENT + 2);

    press('ArrowLeft');
    expect(percent).toBe(DEFAULT_SPLIT_PERCENT);

    press('ArrowRight', true);
    expect(percent).toBe(DEFAULT_SPLIT_PERCENT + 10);
  });

  it('clamps the same way the drag does', () => {
    for (let i = 0; i < 40; i += 1) press('ArrowLeft', true);
    expect(percent).toBe(MIN_SPLIT_PERCENT);

    for (let i = 0; i < 40; i += 1) press('ArrowRight', true);
    expect(percent).toBe(MAX_SPLIT_PERCENT);
  });

  it('goes back to the default on Home', () => {
    press('ArrowRight', true);
    press('Home');

    expect(percent).toBe(DEFAULT_SPLIT_PERCENT);
  });

  it('is reachable and announces where it is', () => {
    const node = divider();

    expect(node.getAttribute('tabindex')).toBe('0');
    expect(node.getAttribute('aria-orientation')).toBe('vertical');
    expect(node.getAttribute('aria-valuenow')).toBe(String(DEFAULT_SPLIT_PERCENT));

    press('ArrowRight');
    expect(divider().getAttribute('aria-valuenow')).toBe(String(DEFAULT_SPLIT_PERCENT + 2));
  });
});

describe('a double-click on the divider', () => {
  it('puts the split back to the default', () => {
    drag(900);
    expect(percent).not.toBe(DEFAULT_SPLIT_PERCENT);

    act(() => {
      divider().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(percent).toBe(DEFAULT_SPLIT_PERCENT);
  });
});

describe('splitPercentAt', () => {
  it('converts a pointer position into a percentage of the row', () => {
    expect(splitPercentAt(600, ROW)).toBe(50);
    expect(splitPercentAt(350, ROW)).toBe(25);
  });

  it('clamps instead of returning a percentage outside the pane bounds', () => {
    expect(splitPercentAt(0, ROW)).toBe(MIN_SPLIT_PERCENT);
    expect(splitPercentAt(99999, ROW)).toBe(MAX_SPLIT_PERCENT);
  });

  it('declines to guess when the row has not been laid out', () => {
    expect(splitPercentAt(600, { left: 0, width: 0 })).toBeNull();
    expect(splitPercentAt(600, { left: 0, width: NaN })).toBeNull();
  });
});

describe('clampSplit', () => {
  it('keeps a percentage inside the bounds', () => {
    expect(clampSplit(50)).toBe(50);
    expect(clampSplit(-10)).toBe(MIN_SPLIT_PERCENT);
    expect(clampSplit(140)).toBe(MAX_SPLIT_PERCENT);
  });
});
