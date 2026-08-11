/**
 * The editor, mounted for real against jsdom and driven the way a controlled
 * textarea is driven in the browser.
 *
 * jsdom gives `scrollTop` a real readable value, so the sync can be driven here.
 * It has no layout, so how tall a soft-wrapped line renders cannot be measured -
 * that half of the fix is checked in a browser.
 */

import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MdxEditor } from '../src/components/MdxEditor';

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
