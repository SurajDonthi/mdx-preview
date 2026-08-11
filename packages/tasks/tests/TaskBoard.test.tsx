/**
 * The board, mounted for real against jsdom.
 *
 * The guarantees worth pinning down are the ones a reader would notice: the
 * lanes are there, finished work is out of sight but reachable, "ready now"
 * only lists what nothing is blocking, and the PDF pass - which deletes every
 * button on its way out - still shows the whole plan.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MdxRenderContext } from '@mdxstudio/core';

import { TaskBoard } from '../src/TaskBoard';

const SAMPLE = [
  '## AG — Agentic platform',
  '- [x] AG-0a Branch cut and pushed',
  '- [~] AG-0b Agentic code into git @me #infra',
  '- [ ] AG-1 The deletion — needs: AG-0b #risk:high [details](details/agentic-platform.mdx)',
  '- [!] MX-6 TaskBoard — blocked on extension config support',
  '- [→] DW-4 Multi-layer contours (trigger: DW-1c)',
  '',
  '## DW — Drywall',
  'Wall contours come first.',
  '- [x] DW-1c Wall gap healing',
  '- [ ] DW-9 Partition mapping — needs: DW-1c @sam #trade:drywall',
  '- [ ] DW-10 Schedule extraction @ana',
].join('\n');

let container: HTMLDivElement;
let root: Root;

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  source: string,
  renderMode: 'live' | 'pdf' = 'live',
  props: Record<string, unknown> = {}
) {
  act(() => {
    root.render(
      <MdxRenderContext.Provider value={{ renderMode, themeCategory: 'light' }}>
        <TaskBoard {...props}>{source}</TaskBoard>
      </MdxRenderContext.Provider>
    );
  });
}

const all = (selector: string) => Array.from(container.querySelectorAll(selector));
const ids = (selector: string) =>
  all(selector).map((element) => (element as HTMLElement).dataset.taskId ?? '');
const click = (element: Element | null | undefined) => {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
};
const buttonWith = (text: string) =>
  all('button').find((button) => (button.textContent ?? '').includes(text));

/**
 * React tracks the value it last wrote to a field, so assigning `.value`
 * directly leaves it believing nothing changed. The prototype's own setter is
 * what a real keystroke goes through.
 */
function setValue(field: HTMLInputElement | HTMLSelectElement, value: string, event: string) {
  const prototype =
    field instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
  act(() => {
    field.dispatchEvent(new Event(event, { bubbles: true }));
  });
}

describe('lanes', () => {
  it('sorts the tasks into lanes, in status order', () => {
    render(SAMPLE);

    const lanes = all('.mdxstudio-tasks__lane').map(
      (lane) => (lane as HTMLElement).dataset.status
    );

    expect(lanes.slice(0, 4)).toEqual(['in-progress', 'todo', 'blocked', 'deferred']);
    expect(ids('.mdxstudio-tasks__lane[data-status="blocked"] .mdxstudio-tasks__card')).toEqual([
      'MX-6',
    ]);
    expect(ids('.mdxstudio-tasks__lane[data-status="deferred"] .mdxstudio-tasks__card')).toEqual([
      'DW-4',
    ]);
  });

  it('renders one group per heading, with the heading as its title', () => {
    render(SAMPLE);

    expect(all('.mdxstudio-tasks__group')).toHaveLength(2);
    expect(container.textContent).toContain('AG — Agentic platform');
    expect(container.textContent).toContain('DW — Drywall');
  });

  it('shows per-group progress computed from the markers', () => {
    render(SAMPLE);

    const groups = all('.mdxstudio-tasks__group');

    expect((groups[0] as HTMLElement).dataset.percent).toBe('20');
    expect((groups[1] as HTMLElement).dataset.percent).toBe('33');
  });

  it('renders a title as inline markdown', () => {
    render('- [ ] AG-1 ship **now** with `care`, see [the plan](plan.mdx) first');

    expect(container.querySelector('.mdxstudio-tasks__title strong')?.textContent).toBe('now');
    expect(container.querySelector('.mdxstudio-tasks__title code')?.textContent).toBe('care');
    expect(
      container.querySelector<HTMLAnchorElement>('.mdxstudio-tasks__title a')?.getAttribute('href')
    ).toBe('plan.mdx');
  });

  it('renders a trailing link as the task detail link, not as part of the title', () => {
    render('- [ ] AG-1 The deletion [details](details/agentic-platform.mdx)');

    const link = container.querySelector<HTMLAnchorElement>('.mdxstudio-tasks__link');

    expect(link?.getAttribute('href')).toBe('details/agentic-platform.mdx');
    expect(link?.textContent).toBe('details');
    expect(container.querySelector('.mdxstudio-tasks__title')?.textContent).toBe('The deletion');
  });

  it('drops a javascript: link target rather than rendering it', () => {
    render('- [ ] [click](javascript:alert(1)) me');

    const link = container.querySelector('.mdxstudio-tasks__title a');

    expect(link).toBeNull();
    expect(container.textContent).toContain('click');
  });

  it('keeps an unreadable line as a note', () => {
    render(SAMPLE);

    expect(all('.mdxstudio-tasks__note').map((note) => note.textContent)).toEqual([
      'Wall contours come first.',
    ]);
  });

  it('says so when the fence is empty instead of rendering an empty frame', () => {
    render('');

    expect(all('.mdxstudio-tasks__card')).toHaveLength(0);
    expect(container.textContent).toContain('no tasks');
  });
});

describe('done', () => {
  it('hides finished work behind a disclosure that counts it', () => {
    render(SAMPLE);

    expect(ids('.mdxstudio-tasks__card[data-status="done"]')).toEqual([]);
    expect(buttonWith('Done (1)')).toBeTruthy();
  });

  it('brings it back when the disclosure is opened', () => {
    render(SAMPLE);

    click(buttonWith('Done (1)'));

    expect(ids('.mdxstudio-tasks__card[data-status="done"]')).toContain('AG-0a');
  });

  it('leaves out the disclosure for a group that has finished nothing', () => {
    render('- [ ] A-1 one\n- [~] A-2 two');

    expect(buttonWith('Done')).toBeUndefined();
  });
});

describe('ready now', () => {
  it('lists the todo tasks nothing is blocking', () => {
    render(SAMPLE);

    expect(ids('.mdxstudio-tasks__ready-item')).toEqual(['DW-9', 'DW-10']);
  });

  it('leaves out a task whose dependency is unfinished', () => {
    render(SAMPLE);

    expect(ids('.mdxstudio-tasks__ready-item')).not.toContain('AG-1');
  });

  it('leaves out blocked, deferred and in-progress tasks', () => {
    render(SAMPLE);

    const ready = ids('.mdxstudio-tasks__ready-item');

    expect(ready).not.toContain('MX-6');
    expect(ready).not.toContain('DW-4');
    expect(ready).not.toContain('AG-0b');
  });

  it('is left out entirely when nothing is ready', () => {
    render('- [ ] A-1 one — needs: A-2\n- [~] A-2 two');

    expect(all('.mdxstudio-tasks__ready')).toHaveLength(0);
  });

  it('names what a task is waiting for, with the title where it knows it', () => {
    render(SAMPLE);

    const needs = container.querySelector('.mdxstudio-tasks__need');

    expect(needs?.textContent).toContain('AG-0b');
    expect(needs?.textContent).toContain('Agentic code into git');
  });
});

describe('filters', () => {
  it('offers an owner and a tag filter when there is a choice to make', () => {
    render(SAMPLE);

    expect(all('select')).toHaveLength(2);
  });

  it('offers neither when the document has one owner and one tag', () => {
    render('- [ ] A-1 one @me #infra\n- [ ] A-2 two @me #infra');

    expect(all('select')).toHaveLength(0);
  });

  it('narrows the board to one owner', () => {
    render(SAMPLE);

    setValue(all('select')[0] as HTMLSelectElement, 'sam', 'change');

    expect(ids('.mdxstudio-tasks__card')).toEqual(['DW-9']);
  });

  it('narrows the board to a text match', () => {
    render(SAMPLE);

    setValue(container.querySelector('input') as HTMLInputElement, 'contours', 'input');

    expect(ids('.mdxstudio-tasks__card')).toEqual(['DW-4']);
  });
});

describe('kanban', () => {
  it('switches to columns and keeps the same tasks', () => {
    render(SAMPLE);

    click(buttonWith('Kanban'));

    expect(all('.mdxstudio-tasks__column')).not.toHaveLength(0);
    expect(all('.mdxstudio-tasks__lane')).toHaveLength(0);
    expect(ids('.mdxstudio-tasks__card')).toEqual(['AG-0b', 'AG-1', 'DW-9', 'DW-10', 'MX-6', 'DW-4']);
  });

  it('starts in kanban when the document asks for it', () => {
    render(SAMPLE, 'live', { view: 'kanban' });

    expect(all('.mdxstudio-tasks__column')).not.toHaveLength(0);
  });
});

describe('the PDF pass', () => {
  it('renders no control the exporter would delete', () => {
    render(SAMPLE, 'pdf');

    expect(all('button')).toHaveLength(0);
    expect(all('input')).toHaveLength(0);
    expect(all('select')).toHaveLength(0);
    expect(all('[data-pdf-interactive="true"]')).toHaveLength(0);
  });

  it('shows every task, finished ones included', () => {
    render(SAMPLE, 'pdf');

    expect(ids('.mdxstudio-tasks__card').sort()).toEqual(
      ['AG-0a', 'AG-0b', 'AG-1', 'MX-6', 'DW-4', 'DW-1c', 'DW-9', 'DW-10'].sort()
    );
  });

  it('still shows what is ready to pick up', () => {
    render(SAMPLE, 'pdf');

    expect(ids('.mdxstudio-tasks__ready-item')).toEqual(['DW-9', 'DW-10']);
  });

  it('ignores a document that asked for kanban, which has no columns on paper', () => {
    render(SAMPLE, 'pdf', { view: 'kanban' });

    expect(all('.mdxstudio-tasks__column')).toHaveLength(0);
    expect(all('.mdxstudio-tasks__lane')).not.toHaveLength(0);
  });
});

describe('input it was not given', () => {
  it('renders rather than throwing when there is no source at all', () => {
    act(() => {
      root.render(<TaskBoard />);
    });

    expect(container.textContent).toContain('no tasks');
  });

  it('takes the source as a prop as well as as children', () => {
    render('', 'live', { source: '- [ ] A-1 from a prop' });

    expect(ids('.mdxstudio-tasks__card')).toEqual(['A-1']);
  });

  it('does not throw on children that are not text', () => {
    expect(() =>
      act(() => {
        root.render(
          <TaskBoard>
            <span>- [ ] A-1 wrapped</span>
          </TaskBoard>
        );
      })
    ).not.toThrow();
  });
});
