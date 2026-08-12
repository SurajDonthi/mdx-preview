/**
 * The board, mounted for real.
 *
 * These are the claims the component makes that a parser test cannot check: the
 * two disclosures being genuinely independent, the path to work in progress
 * opening on load, a control appearing only when it would have something to do,
 * and the export pass finding everything present once its buttons are gone.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MdxRenderContext } from '@mdxstudio/core';

import { TaskBoard } from '../src/TaskBoard';
import type { TaskNode, TaskStatus } from '../src/parseTasks';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: React.ReactNode, renderMode: 'live' | 'pdf' = 'live') {
  act(() => {
    root.render(
      <MdxRenderContext.Provider value={{ renderMode, themeCategory: 'light' }}>
        {node}
      </MdxRenderContext.Provider>
    );
  });
}

const PLAN = [
  '- [ ] AG-1: Delete the engine   @ann   !p1   est: 3d   #risk',
  '    Remove the runner and the trade workflows.',
  '    The API must still boot.',
  '    - [x] Prune the schema package',
  '    - [ ] Rewire the API needs: AG-9',
  '        - [~] Port the routes',
  '- [ ] AG-9: Second epic @bo #ui',
  '    - [ ] A leaf with no prose',
  '- [?] a line the parser cannot read',
].join('\n');

const rows = () => Array.from(container.querySelectorAll<HTMLElement>('[data-task-key]'));
const titles = () =>
  rows().map((row) => row.querySelector('.mdxstudio-tasks__title')?.textContent ?? '');
const titled = (text: string) =>
  rows().find((row) => row.querySelector('.mdxstudio-tasks__title')?.textContent === text);
const buttonLabelled = (fragment: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    (button.getAttribute('aria-label') ?? '').includes(fragment)
  );
/** The `<select>` under the toolbar control labelled `label`. */
const selectFor = (label: string) => {
  const control = Array.from(container.querySelectorAll('.mdxstudio-tasks__control')).find(
    (node) => node.querySelector('.mdxstudio-tasks__control-label')?.textContent === label
  );
  return control?.querySelector('select') as HTMLSelectElement;
};
const choose = (label: string, value: string) => {
  const element = selectFor(label);
  act(() => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const click = (element: Element | undefined) => {
  if (!element) throw new Error('nothing to click');
  act(() => {
    (element as HTMLElement).click();
  });
};

describe('what is open on load', () => {
  it('collapses children by default, including at the top level', () => {
    render(<TaskBoard source={'- [ ] one\n    - [ ] two\n- [ ] three'} />);

    expect(titles()).toEqual(['one', 'three']);
  });

  it('starts with every branch closed, whatever the plan contains', () => {
    render(<TaskBoard source={PLAN} />);

    // Only the top level. Nothing below it is rendered - not the path to the
    // [~] either, which an earlier version opened. A board whose starting
    // shape depends on the contents is one a reader cannot learn.
    expect(titles()).toEqual(['Delete the engine', 'Second epic']);
  });

  it('opens the same way whether or not there is work in progress', () => {
    render(<TaskBoard source={'- [ ] parent\n    - [~] child'} />);
    expect(titles()).toEqual(['parent']);

    render(<TaskBoard source={'- [ ] parent\n    - [ ] child'} />);
    expect(titles()).toEqual(['parent']);
  });

  it('pins the work in flight above everything else', () => {
    render(<TaskBoard source={'- [ ] first in the file\n- [~] started later'} />);

    expect(titles()).toEqual(['started later', 'first in the file']);
    expect(container.querySelector('.mdxstudio-tasks__flight')?.textContent).toContain(
      'started later'
    );
  });

  it('leaves descriptions closed even on the auto-expanded path', () => {
    render(<TaskBoard source={PLAN} />);

    expect(container.querySelector('.mdxstudio-tasks__description')).toBeNull();
  });
});

describe('the two disclosures', () => {
  it('opens a description without opening the children', () => {
    render(<TaskBoard source={PLAN} />);
    const before = titles();

    click(buttonLabelled('Show notes for Delete the engine'));

    expect(container.querySelector('.mdxstudio-tasks__description')?.textContent).toContain(
      'Remove the runner'
    );
    expect(titles()).toEqual(before);
  });

  it('opens the children without opening the description', () => {
    render(<TaskBoard source={'- [ ] parent\n    prose here\n    - [ ] child'} />);

    expect(titles()).toEqual(['parent']);
    click(buttonLabelled('Expand parent'));

    expect(titles()).toEqual(['parent', 'child']);
    expect(container.querySelector('.mdxstudio-tasks__description')).toBeNull();
  });

  it('keeps a description open while its children are collapsed again', () => {
    render(<TaskBoard source={'- [ ] parent\n    prose here\n    - [ ] child'} />);

    click(buttonLabelled('Show notes for parent'));
    click(buttonLabelled('Expand parent'));
    click(buttonLabelled('Collapse parent'));

    expect(titles()).toEqual(['parent']);
    expect(container.querySelector('.mdxstudio-tasks__description')?.textContent).toContain(
      'prose here'
    );
  });

  it('gives a node with no prose no description control at all', () => {
    render(<TaskBoard source={PLAN} />);

    expect(buttonLabelled('notes for A leaf with no prose')).toBeUndefined();
    expect(buttonLabelled('notes for Delete the engine')).toBeDefined();
  });

  it('holds the space anyway, so the row actions stay in line', () => {
    render(<TaskBoard source={'- [ ] no prose here'} />);
    const row = titled('no prose here');

    // A gap, not a button: nothing to press and nothing promised.
    expect(row?.querySelector('.mdxstudio-tasks__action-gap')).not.toBeNull();
    expect(row?.querySelectorAll('button.mdxstudio-tasks__action--notes')).toHaveLength(0);
  });
});

describe('what a collapsed parent carries', () => {
  const NESTED = '- [ ] Epic\n    - [ ] A-1: one\n    - [ ] two needs: A-1';

  it('shows subtree progress, and what is blocked inside it', () => {
    render(<TaskBoard source={NESTED} />);
    const summary = titled('Epic')?.querySelector('.mdxstudio-tasks__summary');

    // Collapsed: the ring, the count and the blockage decide whether to open it.
    expect(summary?.textContent).toContain('0/2');
    expect(summary?.querySelector('.mdxstudio-tasks__ring')).not.toBeNull();
    // A mark and a number, not a sentence.
    const blocked = summary?.querySelector('.mdxstudio-tasks__summary-text--blocked');
    expect(blocked?.textContent).toBe('1');
    expect(blocked?.getAttribute('aria-label')).toBe('1 blocked inside');
  });

  it('puts the exact counts in the tooltip rather than on the row', () => {
    render(<TaskBoard source={NESTED} />);
    const summary = titled('Epic')?.querySelector('.mdxstudio-tasks__summary');

    expect(summary?.getAttribute('title')).toContain('0 of 2 done');
  });

  it('draws no durations, estimated or remaining', () => {
    // `est:` is parsed and available through `parseTaskBoard`; the board does
    // not forecast on the reader's behalf.
    render(<TaskBoard source={'- [ ] Epic est: 3d\n    - [ ] child est: 2h'} />);

    expect(container.textContent).not.toContain('3d');
    expect(container.textContent).not.toContain('left');
  });

  it('never says the word "ready" anywhere on screen', () => {
    // Readiness is derived and available through the parser. It is not a thing
    // the board tells the reader about, on a row or anywhere else.
    render(<TaskBoard source={NESTED} />);

    expect(container.textContent?.toLowerCase()).not.toContain('ready');
  });

  it('drops the counts once the row is open, since the children say it', () => {
    render(<TaskBoard source={NESTED} />);
    click(buttonLabelled('Expand Epic'));

    expect(titled('Epic')?.querySelector('.mdxstudio-tasks__summary')?.textContent).not.toContain(
      'blocked'
    );
  });

  it('gives a leaf no summary to carry', () => {
    render(<TaskBoard source={PLAN} />);
    click(buttonLabelled('Expand every item'));

    expect(titled('Port the routes')?.querySelector('.mdxstudio-tasks__summary')).toBeNull();
  });
});

describe('malformed lines', () => {
  it('renders in place, dimmed, with the text intact', () => {
    render(<TaskBoard source={PLAN} />);
    const plain = container.querySelector('.mdxstudio-tasks__row--plain');

    expect(plain?.textContent).toBe('- [?] a line the parser cannot read');
    // In place means last here, because that is where it was written.
    const all = Array.from(container.querySelectorAll('.mdxstudio-tasks__row'));
    expect(all[all.length - 1]).toBe(plain);
  });
});

describe('filters', () => {
  it('renders a control only when it would have more than one option', () => {
    render(<TaskBoard source={'- [ ] one @ann #risk milestone: v1\n- [ ] two @ann #risk milestone: v1'} />);

    const labels = Array.from(container.querySelectorAll('.mdxstudio-tasks__control-label')).map(
      (node) => node.textContent
    );
    expect(labels).toEqual(['Group']);
  });

  it('renders the controls once a second option exists', () => {
    render(<TaskBoard source={PLAN} />);

    const labels = Array.from(container.querySelectorAll('.mdxstudio-tasks__control-label')).map(
      (node) => node.textContent
    );
    expect(labels).toContain('Assignee');
    expect(labels).toContain('Label');
    expect(labels).not.toContain('Milestone');
  });

  it('filters to one assignee and keeps the ancestors as context', () => {
    render(<TaskBoard source={PLAN} />);
    choose('Assignee', 'bo');

    expect(titles()).toEqual(['Second epic', 'A leaf with no prose']);
  });

  it('offers an epic filter only when there are two epics to choose between', () => {
    render(<TaskBoard source={'- [ ] only epic\n    - [ ] child\n- [ ] a leaf'} />);
    expect(
      Array.from(container.querySelectorAll('.mdxstudio-tasks__control-label')).map(
        (node) => node.textContent
      )
    ).not.toContain('Epic');

    render(<TaskBoard source={PLAN} />);
    expect(
      Array.from(container.querySelectorAll('.mdxstudio-tasks__control-label')).map(
        (node) => node.textContent
      )
    ).toContain('Epic');
  });

  it('scopes the board to one epic, subtree and all', () => {
    render(<TaskBoard source={PLAN} />);
    const second = Array.from(selectFor('Epic').options).find(
      (option) => option.textContent === 'AG-9 Second epic'
    );
    choose('Epic', second!.value);

    expect(titles()).toEqual(['Second epic', 'A leaf with no prose']);
  });

  it('offers no readiness filter at all', () => {
    render(<TaskBoard source={PLAN} />);

    expect(
      Array.from(container.querySelectorAll('button')).map((button) => button.textContent)
    ).not.toContain('Ready now');
  });
});

describe('views', () => {
  it('switches to a board of leaf cards with their ancestors as context', () => {
    render(<TaskBoard source={PLAN} />);

    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Board'));

    const cards = Array.from(container.querySelectorAll('.mdxstudio-tasks__card'));
    const cardTitles = cards.map((card) => card.querySelector('.mdxstudio-tasks__title')?.textContent);
    expect(cardTitles).toContain('Port the routes');
    // An epic is context for its children, not a card of its own.
    expect(cardTitles).not.toContain('Delete the engine');
    expect(cards[0].querySelector('.mdxstudio-tasks__context')?.textContent).toContain('›');
  });

  it('puts completed and canceled work in one bucket at the end, deferred in its own', () => {
    render(<TaskBoard source={'- [ ] open\n- [x] closed\n- [-] dropped\n- [→] later'} />);

    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Board'));

    const heads = Array.from(container.querySelectorAll('.mdxstudio-tasks__column-head')).map(
      (head) => head.querySelector('.mdxstudio-tasks__column-title')?.textContent
    );
    expect(heads).toEqual(['All work', 'Deferred', 'Completed and canceled']);
  });

  it('groups the list without losing anything', () => {
    render(<TaskBoard source={PLAN} />);
    choose('Group', 'status');

    const heads = Array.from(container.querySelectorAll('.mdxstudio-tasks__section-head')).map(
      (head) => head.querySelector('.mdxstudio-tasks__column-title')?.textContent
    );
    expect(heads).toContain('In progress');
    expect(rows()).toHaveLength(6);
  });
});

describe('the row rail', () => {
  it('shows three labels and counts the rest', () => {
    render(<TaskBoard source={'- [ ] many #a #b #c #d #e'} />);
    const row = titled('many');

    expect(row?.querySelectorAll('.mdxstudio-tasks__label')).toHaveLength(3);
    expect(row?.querySelector('.mdxstudio-tasks__label-more')?.textContent).toBe('+2');
    expect(row?.querySelector('.mdxstudio-tasks__slot--labels')?.getAttribute('title')).toBe(
      '#a #b #c #d #e'
    );
  });

  it('runs copy, notes, assignee, labels, milestone from the right', () => {
    render(<TaskBoard source={'- [ ] one @ann #risk milestone: v2\n    notes here'} />);
    const row = titled('one')!;
    const order = Array.from(
      row.querySelectorAll(
        '.mdxstudio-tasks__slot--needs, .mdxstudio-tasks__slot--when, .mdxstudio-tasks__slot--labels, .mdxstudio-tasks__slot--who, .mdxstudio-tasks__action--notes, [aria-label^="Copy the source line"]'
      )
    ).map((node) =>
      /(needs|when|labels|who|notes)/.exec(node.className)?.[1] ?? 'copy'
    );

    expect(order).toEqual(['needs', 'when', 'labels', 'who', 'notes', 'copy']);
  });
});

describe('a filter and the twisties', () => {
  it('opens the way down to what it matched', () => {
    render(<TaskBoard source={PLAN} />);
    choose('Assignee', 'bo');

    // "A leaf with no prose" is inside AG-9, which was closed on load.
    expect(titles()).toContain('A leaf with no prose');
  });

  it('still lets the reader collapse a row while the filter is on', () => {
    render(<TaskBoard source={PLAN} />);
    choose('Assignee', 'bo');
    click(buttonLabelled('Collapse Second epic'));

    expect(titles()).toEqual(['Second epic']);
  });

  it('does not spring a row back open on the next render', () => {
    render(<TaskBoard source={PLAN} />);
    choose('Assignee', 'bo');
    click(buttonLabelled('Collapse Second epic'));
    // Any other interaction re-renders; the row has to stay collapsed.
    click(buttonLabelled('Copy every visible line'));

    expect(titles()).toEqual(['Second epic']);
  });
});

describe('settled work sinking to the bottom', () => {
  const plan = [
    '- [x] finished first',
    '- [ ] still open',
    '- [-] dropped',
    '- [→] later',
    '- [~] in flight',
  ].join('\n');

  it('takes closed and deferred work out of the live list', () => {
    render(<TaskBoard source={plan} />);

    // In flight first, then what is left; the other three have sunk.
    expect(titles()).toEqual(['in flight', 'still open']);
  });

  it('folds them into two buckets at the end, with their counts', () => {
    render(<TaskBoard source={plan} />);
    const heads = Array.from(container.querySelectorAll('.mdxstudio-tasks__section-head')).map(
      (head) => head.querySelector('.mdxstudio-tasks__column-title')?.textContent
    );

    expect(heads).toEqual(['Deferred', 'Completed and canceled']);
    expect(buttonLabelled('Expand Completed and canceled')).toBeDefined();
  });

  it('opens a bucket on request', () => {
    render(<TaskBoard source={plan} />);
    click(buttonLabelled('Expand Completed and canceled'));

    expect(titles()).toEqual(['in flight', 'still open', 'finished first', 'dropped']);
  });

  it('keeps a done item that still has open children in the live list', () => {
    // The done-over-open inconsistency is the one thing that must not be
    // folded away out of sight.
    render(<TaskBoard source={'- [x] Epic\n    - [ ] still open\n- [ ] other'} />);

    expect(titles()).toContain('Epic');
  });

  it('sinks a done subtask too, out of its parent', () => {
    render(<TaskBoard source={'- [ ] Epic\n    - [x] done child\n    - [ ] open child'} />);
    click(buttonLabelled('Expand Epic'));

    expect(titles()).toEqual(['Epic', 'open child']);
    expect(buttonLabelled('Expand Completed and canceled')).toBeDefined();
  });

  it('shows a sunk subtask with the tree it came from', () => {
    render(<TaskBoard source={'- [ ] Epic\n    - [x] done child\n    - [ ] open child'} />);
    click(buttonLabelled('Expand Completed and canceled'));

    const row = titled('done child');
    expect(row?.querySelector('.mdxstudio-tasks__context')?.textContent).toContain('Epic');
  });

  it('opens a bucket when a filter matches something inside it', () => {
    render(<TaskBoard source={'- [x] closed @ann\n- [ ] open @bo'} />);
    choose('Assignee', 'ann');

    expect(titles()).toEqual(['closed']);
  });

  it('shows everything in the export pass', () => {
    render(<TaskBoard source={plan} />, 'pdf');

    expect(titles()).toEqual(['in flight', 'still open', 'later', 'finished first', 'dropped']);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('the head of a long plan', () => {
  const long = [
    '- [ ] one',
    '- [ ] two',
    '- [ ] three',
    '- [ ] four',
    '- [ ] five',
    '- [ ] six',
    '- [ ] seven',
    '- [ ] eight',
    '- [~] nine, and in flight',
  ].join('\n');

  it('shows the first few items and offers the rest', () => {
    render(<TaskBoard source={long} initialItems={3} />);

    // The item in flight first, then three by document order.
    expect(titles()).toEqual(['nine, and in flight', 'one', 'two', 'three']);
    expect(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('View 5 more')
      )
    ).toBeDefined();
  });

  it('shows the rest when asked, and folds back again', () => {
    render(<TaskBoard source={long} initialItems={3} />);
    click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('View 5 more')
      )
    );

    expect(titles()).toHaveLength(9);

    click(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Show the next few again')
      )
    );
    expect(titles()).toHaveLength(4);
  });

  it('offers nothing to expand when the plan is short', () => {
    render(<TaskBoard source={'- [ ] one\n- [ ] two'} initialItems={3} />);

    expect(
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('View')
      )
    ).toBeUndefined();
  });

  it('lifts the cap for a filter and for the export pass', () => {
    render(<TaskBoard source={long} initialItems={3} />);
    act(() => {
      const search = container.querySelector<HTMLInputElement>('.mdxstudio-tasks__search')!;
      // React tracks the value it set, so a plain assignment looks like no
      // change at all; the native setter is what a real keystroke goes through.
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(search, 'e');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(titles().length).toBeGreaterThan(4);
  });

  it('shows every item in the export pass', () => {
    render(<TaskBoard source={long} initialItems={3} />, 'pdf');

    expect(titles()).toHaveLength(9);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('collapsible columns', () => {
  const four = '- [ ] open @ann\n- [x] closed @ann\n- [-] dropped @bo\n- [→] later @bo';

  it('opens the board with the settled columns already folded', () => {
    render(<TaskBoard source={four} />);
    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Board'));

    // Only "open" is live work; the other three are behind two folded headings.
    expect(container.querySelectorAll('.mdxstudio-tasks__card')).toHaveLength(1);
    expect(buttonLabelled('Expand Completed and canceled')).toBeDefined();
    expect(buttonLabelled('Expand Deferred')).toBeDefined();
  });

  it('folds one board column without touching the others', () => {
    render(<TaskBoard source={four} />);
    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Board'));
    click(buttonLabelled('Expand Completed and canceled'));

    expect(container.querySelectorAll('.mdxstudio-tasks__card')).toHaveLength(3);
    click(buttonLabelled('Collapse Completed and canceled'));

    expect(container.querySelectorAll('.mdxstudio-tasks__card')).toHaveLength(1);
    // The heading stays, with its count, so nothing has silently vanished.
    expect(buttonLabelled('Expand Completed and canceled')).toBeDefined();
  });

  it('folds a grouped list section too', () => {
    render(<TaskBoard source={four} />);
    choose('Group', 'status');
    const before = rows().length;

    click(buttonLabelled('Collapse Done'));

    expect(rows().length).toBe(before - 1);
  });

  it('collapses and expands every column at once', () => {
    render(<TaskBoard source={four} />);
    click(Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Board'));

    click(buttonLabelled('Collapse every column'));
    expect(container.querySelectorAll('.mdxstudio-tasks__card')).toHaveLength(0);

    click(buttonLabelled('Expand every column'));
    expect(container.querySelectorAll('.mdxstudio-tasks__card')).toHaveLength(4);
  });

  it('gives the export pass headings rather than buttons', () => {
    render(<TaskBoard source={four} defaultGroupBy="status" />, 'pdf');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(
      Array.from(container.querySelectorAll('.mdxstudio-tasks__column-title')).map(
        (node) => node.textContent
      )
    ).toContain('Done');
  });
});

describe('expand and collapse everything', () => {
  it('opens every row and closes every row', () => {
    render(<TaskBoard source={PLAN} />);

    click(buttonLabelled('Expand every item'));
    // Five: the sixth, 'Prune the schema package', is done and has sunk.
    expect(titles()).toHaveLength(5);

    click(buttonLabelled('Collapse every item'));
    expect(titles()).toEqual(['Delete the engine', 'Second epic']);
  });
});

describe('copy', () => {
  it('hands over the verbatim source line', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<TaskBoard source={PLAN} />);
    // Everything starts closed, so open it before reaching for a nested row.
    click(buttonLabelled('Expand every item'));
    click(buttonLabelled('Copy the source line for Rewire the API'));

    expect(writeText).toHaveBeenCalledWith('    - [ ] Rewire the API needs: AG-9');
  });

  it('hands over every visible line, in document order', () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<TaskBoard source={PLAN} />);
    click(buttonLabelled('Expand every item'));
    click(buttonLabelled('Copy every visible line'));

    const payload = writeText.mock.calls[0][0];
    // Document order, even though the board shows the in-flight branch first
    // and the done line is folded into the bucket at the bottom.
    expect(payload.split('\n')).toEqual([
      '- [ ] AG-1: Delete the engine   @ann   !p1   est: 3d   #risk',
      '    - [ ] Rewire the API needs: AG-9',
      '        - [~] Port the routes',
      '- [ ] AG-9: Second epic @bo #ui',
      '    - [ ] A leaf with no prose',
      '- [?] a line the parser cannot read',
    ]);
  });

  it('includes an opened bucket in the payload, still in document order', () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<TaskBoard source={PLAN} />);
    click(buttonLabelled('Expand Completed and canceled'));
    click(buttonLabelled('Copy every visible line'));

    const payload = writeText.mock.calls[0][0];
    expect(payload.split('\n')[1]).toBe('    - [x] Prune the schema package');
  });
});

describe('the interactive seam', () => {
  it('renders no status control and no move controls when nothing is wired', () => {
    render(<TaskBoard source={PLAN} />);

    expect(container.querySelector('button.mdxstudio-tasks__status')).toBeNull();
    expect(buttonLabelled('Move Delete the engine up')).toBeUndefined();
  });

  it('renders a status control once onToggleStatus is supplied', () => {
    const calls: Array<[string, TaskStatus]> = [];
    render(
      <TaskBoard
        source={PLAN}
        onToggleStatus={(node: TaskNode, next: TaskStatus) => calls.push([node.title, next])}
      />
    );

    click(container.querySelector('button.mdxstudio-tasks__status')!);
    expect(calls).toEqual([['Delete the engine', 'in-progress']]);
  });

  it('will not offer to complete a parent whose children are not done', () => {
    const calls: Array<[string, TaskStatus]> = [];
    render(
      <TaskBoard
        source={'- [~] Epic\n    - [ ] still open'}
        onToggleStatus={(node: TaskNode, next: TaskStatus) => calls.push([node.title, next])}
      />
    );

    const status = container.querySelector<HTMLButtonElement>('button.mdxstudio-tasks__status')!;
    expect(status.dataset.cannotComplete).toBe('true');
    expect(status.title).toContain('Finish the 1 item');

    // In progress would normally tick to done; with work inside, it cycles back.
    click(status);
    expect(calls).toEqual([['Epic', 'todo']]);
  });

  it('offers completion once the work inside is finished', () => {
    const calls: Array<[string, TaskStatus]> = [];
    render(
      <TaskBoard
        source={'- [~] Epic\n    - [x] done child'}
        onToggleStatus={(node: TaskNode, next: TaskStatus) => calls.push([node.title, next])}
      />
    );

    const status = container.querySelector<HTMLButtonElement>('button.mdxstudio-tasks__status')!;
    expect(status.dataset.cannotComplete).toBeUndefined();
    click(status);
    expect(calls).toEqual([['Epic', 'done']]);
  });

  it('renders move controls once onMove is supplied, and changes nothing itself', () => {
    const moves: string[] = [];
    render(<TaskBoard source={PLAN} onMove={(_node, next) => moves.push(next.direction)} />);

    click(buttonLabelled('Move Delete the engine down'));
    expect(moves).toEqual(['down']);
    // The board is a view of the file; a move is the host's to make.
    expect(titles()[0]).toBe('Delete the engine');
  });
});

describe('the export pass', () => {
  it('renders no buttons at all', () => {
    render(<TaskBoard source={PLAN} onToggleStatus={() => undefined} onMove={() => undefined} />, 'pdf');

    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('select')).toHaveLength(0);
  });

  it('shows every row, every description and the closed work', () => {
    render(<TaskBoard source={PLAN} />, 'pdf');

    // Every row is present; the settled one is in its bucket, unfolded.
    expect(titles()).toEqual([
      'Delete the engine',
      'Rewire the API',
      'Port the routes',
      'Second epic',
      'A leaf with no prose',
      'Prune the schema package',
    ]);
    expect(container.querySelector('.mdxstudio-tasks__description')?.textContent).toContain(
      'Remove the runner'
    );
    expect(container.querySelector('.mdxstudio-tasks__row--plain')).not.toBeNull();
  });

  it('keeps the light palette whatever the screen theme was', () => {
    act(() => {
      root.render(
        <MdxRenderContext.Provider value={{ renderMode: 'pdf', themeCategory: 'dark' }}>
          <TaskBoard source={PLAN} />
        </MdxRenderContext.Provider>
      );
    });

    expect(container.querySelector('.mdxstudio-tasks')?.getAttribute('data-mdxstudio-theme')).toBe(
      'light'
    );
  });

  it('follows the theme category on screen', () => {
    act(() => {
      root.render(
        <MdxRenderContext.Provider value={{ renderMode: 'live', themeCategory: 'dark' }}>
          <TaskBoard source={PLAN} />
        </MdxRenderContext.Provider>
      );
    });

    expect(container.querySelector('.mdxstudio-tasks')?.getAttribute('data-mdxstudio-theme')).toBe(
      'dark'
    );
  });
});

describe('the source it reads', () => {
  it('takes the fence content as children', () => {
    render(<TaskBoard language="tasks">{'- [ ] from children'}</TaskBoard>);

    expect(titles()).toEqual(['from children']);
  });

  it('takes children handed over as an array of strings', () => {
    render(<TaskBoard>{['- [ ] one\n', '- [ ] two']}</TaskBoard>);

    expect(titles()).toEqual(['one', 'two']);
  });

  it('renders a notice rather than nothing when there is no plan at all', () => {
    render(<TaskBoard source="" />);

    expect(container.querySelector('.mdxstudio-tasks__empty')).not.toBeNull();
  });

  it('never throws on input it cannot read', () => {
    expect(() => render(<TaskBoard source={'- [?] junk\n\t\t- [ ] \u0000'} />)).not.toThrow();
    expect(() => render(<TaskBoard>{42 as unknown as React.ReactNode}</TaskBoard>)).not.toThrow();
  });
});

describe('the inconsistency', () => {
  it('is surfaced on the row and left uncorrected', () => {
    render(<TaskBoard source={'- [x] Epic\n    - [ ] still open'} />);
    const row = titled('Epic');

    expect(row?.textContent).toContain('done over 1 open');
    expect(row?.getAttribute('data-task-status')).toBe('done');
  });
});
