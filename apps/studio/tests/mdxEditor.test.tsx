/**
 * The editor, mounted for real against jsdom and driven the way a controlled
 * textarea is driven in the browser.
 *
 * jsdom implements the two behaviours these guard: assigning `textarea.value`
 * moves the text entry cursor to the end of the text, and `scrollTop` is a real
 * readable property. It has no layout, so how tall a soft-wrapped line renders
 * cannot be measured here - that half of the gutter fix is checked in a browser.
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
