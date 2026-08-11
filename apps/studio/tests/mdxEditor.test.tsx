/**
 * The editor, mounted for real against jsdom and driven the way a controlled
 * textarea is driven in the browser.
 *
 * jsdom implements the two behaviours these guard: assigning `textarea.value`
 * moves the text entry cursor to the end of the text, and `scrollTop` is a real
 * readable property. It has no layout, so how tall a soft-wrapped line renders
 * cannot be measured here - that half of the gutter fix is checked in a browser.
 */

import React, { act, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxEditor, type MdxEditorHandle } from '../src/components/MdxEditor';

const DOCUMENT = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of the document`).join('\n');

let container: HTMLDivElement;
let root: Root;

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <MdxEditor value={value} onChange={setValue} />;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness initial={DOCUMENT} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const textarea = () => container.querySelector('textarea')!;

/** The line number column: the textarea's first sibling in the editor body. */
const gutter = () => textarea().parentElement!.firstElementChild as HTMLElement;

/** What the browser does to a controlled textarea when a character is typed. */
function type(text: string, at: number) {
  const element = textarea();
  const next = element.value.slice(0, at) + text + element.value.slice(at);
  const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  act(() => {
    setValue.call(element, next);
    element.setSelectionRange(at + text.length, at + text.length);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('the caret in the editor', () => {
  it('stays where the user typed it', () => {
    type('XYZ', 10);

    expect(textarea().value.slice(10, 13)).toBe('XYZ');
    expect(textarea().selectionStart).toBe(13);
  });

  it('goes back to the edit, not to the end of the document, when the value is replaced', () => {
    type('XYZ', 10);

    const undo = container.querySelector<HTMLButtonElement>('button[title^="Undo"]')!;
    expect(undo.disabled).toBe(false);
    act(() => undo.click());

    // React reassigns the textarea's value here, which drops the caret at the
    // end of the text. It has to come back to where the undone edit was.
    expect(textarea().value).toBe(DOCUMENT);
    expect(textarea().selectionStart).toBe(10);
    expect(textarea().selectionStart).not.toBe(DOCUMENT.length);
  });

  it('lands at the far side of an inserted snippet', () => {
    const element = textarea();
    act(() => element.setSelectionRange(10, 10));

    const bold = container.querySelector<HTMLButtonElement>('button[title="Bold"]')!;
    act(() => bold.click());

    expect(element.value.slice(10, 23)).toBe('**bold text**');
    expect(element.selectionStart).toBe(23);
  });

  it('keeps the caret through a redo as well', () => {
    type('XYZ', 10);
    act(() => container.querySelector<HTMLButtonElement>('button[title^="Undo"]')!.click());
    act(() => container.querySelector<HTMLButtonElement>('button[title^="Redo"]')!.click());

    expect(textarea().selectionStart).toBe(13);
  });
});

describe('the line number gutter', () => {
  it('follows the textarea when it scrolls', () => {
    const element = textarea();
    element.scrollTop = 480;
    act(() => element.dispatchEvent(new Event('scroll', { bubbles: true })));

    expect(gutter().scrollTop).toBe(480);
  });

  it('follows it all the way to the bottom', () => {
    const element = textarea();
    element.scrollTop = 4096;
    act(() => element.dispatchEvent(new Event('scroll', { bubbles: true })));

    expect(gutter().scrollTop).toBe(element.scrollTop);
  });

  it('never scrolls the textarea itself, so the two cannot chase each other', () => {
    const element = textarea();
    element.scrollTop = 240;
    act(() => element.dispatchEvent(new Event('scroll', { bubbles: true })));

    const settled = gutter().scrollTop;
    act(() => gutter().dispatchEvent(new Event('scroll', { bubbles: true })));

    expect(element.scrollTop).toBe(240);
    expect(gutter().scrollTop).toBe(settled);
  });

  it('numbers every line of the document', () => {
    expect(gutter().children).toHaveLength(40);
    expect(gutter().lastElementChild!.textContent).toBe('40');
  });
});

/**
 * jsdom has no layout, so the mirror the gutter measures reports every line as
 * 0px tall. Standing a height in for each of its rows is enough to drive the
 * part that is actually ours: reading those measurements back out and turning
 * them into row heights, line offsets and the line at a given offset.
 */
function withMeasuredLines(heights: number[]) {
  const mirror = () => textarea().parentElement!.lastElementChild as HTMLElement;

  return vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
    const rows = Array.from(mirror().children);
    const index = rows.indexOf(this);
    return index >= 0 ? (heights[index] ?? 24) : 0;
  });
}

describe('a soft-wrapped line in the gutter', () => {
  // Line 2 wraps onto three rows and line 5 onto two; the rest are single rows.
  const HEIGHTS = [24, 72, 24, 24, 48, ...Array.from({ length: 35 }, () => 24)];
  let spy: ReturnType<typeof withMeasuredLines>;

  beforeEach(() => {
    spy = withMeasuredLines(HEIGHTS);
    // A fresh key remounts, so the layout effect measures against the stub;
    // re-rendering alone would keep the harness's existing state and value.
    act(() => root.render(<Harness key="measured" initial={DOCUMENT} />));
  });

  afterEach(() => spy.mockRestore());

  it('gives its number the height the line actually renders at', () => {
    const rows = Array.from(gutter().children) as HTMLElement[];

    expect(rows[0].style.height).toBe('24px');
    expect(rows[1].style.height).toBe('72px');
    expect(rows[4].style.height).toBe('48px');
  });

  it('makes the gutter exactly as tall as the text, which is what keeps the two aligned', () => {
    const rows = Array.from(gutter().children) as HTMLElement[];
    const gutterHeight = rows.reduce((total, row) => total + parseFloat(row.style.height), 0);

    expect(gutterHeight).toBe(HEIGHTS.reduce((total, height) => total + height, 0));
  });
});

describe('the editor half of the scroll sync', () => {
  const HEIGHTS = [24, 72, 24, 24, 48, ...Array.from({ length: 35 }, () => 24)];
  let handle: MdxEditorHandle;
  let reported: number[];
  let spy: ReturnType<typeof withMeasuredLines>;

  function SyncHarness() {
    const ref = useRef<MdxEditorHandle | null>(null);
    return (
      <MdxEditor
        ref={(instance) => {
          ref.current = instance;
          if (instance) handle = instance;
        }}
        value={DOCUMENT}
        onChange={() => {}}
        onScrollLine={(line) => reported.push(line)}
      />
    );
  }

  beforeEach(() => {
    reported = [];
    spy = withMeasuredLines(HEIGHTS);
    act(() => root.render(<SyncHarness />));
  });

  afterEach(() => spy.mockRestore());

  it('scrolls to a line past a wrapped one using its real height', () => {
    // Lines 1-3 are 24 + 72 + 24 = 120px tall, so line 4 starts there.
    act(() => handle.scrollToLine(4));

    expect(textarea().scrollTop).toBe(120);
  });

  it('reports the line at the top when the reader scrolls', () => {
    const element = textarea();
    element.scrollTop = 120;
    act(() => element.dispatchEvent(new Event('scroll', { bubbles: true })));

    expect(reported.at(-1)).toBe(4);
  });

  it('round-trips a line through a scroll and back', () => {
    for (const line of [1, 2, 5, 9, 30]) {
      act(() => handle.scrollToLine(line));
      expect(handle.topVisibleLine()).toBeCloseTo(line, 6);
    }
  });

  it('carries a fractional line through, so the panes do not step whole lines', () => {
    // Half of line 2, which is 72px tall, is 24 + 36 = 60px down.
    act(() => handle.scrollToLine(2.5));

    expect(textarea().scrollTop).toBe(60);
    expect(handle.topVisibleLine()).toBeCloseTo(2.5, 6);
  });

  it('keeps the gutter in step when the sync does the scrolling', () => {
    act(() => handle.scrollToLine(6));

    expect(gutter().scrollTop).toBe(textarea().scrollTop);
  });
});
