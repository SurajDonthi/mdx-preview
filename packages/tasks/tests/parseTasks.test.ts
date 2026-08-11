/**
 * The format, line by line.
 *
 * Everything here is about what a plan *says*: which lines are tasks, what a
 * line's own fields are, what flows down from a parent, and what the board is
 * allowed to derive from all of it. The adversarial half lives next door in
 * `neverThrows.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import {
  parseTaskBoard,
  canComplete,
  flattenTasks,
  formatEstimate,
  nextStatus,
  nextStatusFor,
  openInside,
  type TaskNode,
} from '../src/parseTasks';

function tasks(source: string): TaskNode[] {
  return parseTaskBoard(source).tasks;
}

function byTitle(source: string, title: string): TaskNode {
  const found = tasks(source).find((task) => task.title === title);
  if (!found) throw new Error(`no task titled "${title}"`);
  return found;
}

describe('statuses', () => {
  it('reads every marker the format defines', () => {
    const parsed = tasks(
      [
        '- [ ] todo',
        '- [~] in progress',
        '- [x] done lower',
        '- [X] done upper',
        '- [!] blocked',
        '- [→] deferred arrow',
        '- [>] deferred angle',
        '- [-] canceled',
      ].join('\n')
    );

    expect(parsed.map((task) => task.status)).toEqual([
      'todo',
      'in-progress',
      'done',
      'done',
      'blocked',
      'deferred',
      'deferred',
      'canceled',
    ]);
  });

  it('accepts the empty box written with no space', () => {
    expect(tasks('- [] still a box')[0].status).toBe('todo');
  });

  it('keeps an unrecognised marker as a plain line rather than guessing', () => {
    const document = parseTaskBoard('- [ ] real\n- [?] not a marker\n- [ ] also real');

    expect(document.tasks).toHaveLength(2);
    expect(document.items[1].kind).toBe('line');
    expect(document.items[1].source).toBe('- [?] not a marker');
  });

  it('keeps a bullet with no checkbox as a plain line', () => {
    const document = parseTaskBoard('- just a bullet');

    expect(document.tasks).toHaveLength(0);
    expect(document.items[0].kind).toBe('line');
  });

  it('accepts every bullet character', () => {
    expect(tasks('- [ ] dash\n* [ ] star\n+ [ ] plus')).toHaveLength(3);
  });
});

describe('ids', () => {
  it('takes an id that ends with a colon', () => {
    const task = tasks('- [ ] AG-1: Delete the engine')[0];

    expect(task.id).toBe('AG-1');
    expect(task.title).toBe('Delete the engine');
  });

  it('infers no id from a leading word without a colon', () => {
    const task = tasks('- [→] Multi-layer contours   trigger: DW-1c')[0];

    expect(task.id).toBeUndefined();
    expect(task.title).toBe('Multi-layer contours');
    expect(task.fields.trigger).toBe('DW-1c');
  });

  it('leaves a mid-sentence colon in the title', () => {
    const task = tasks('- [ ] Fix the parser: it drops rows')[0];

    expect(task.id).toBeUndefined();
    expect(task.title).toBe('Fix the parser: it drops rows');
  });

  it('resolves an id case-insensitively and keeps the first claim', () => {
    const document = parseTaskBoard('- [ ] AG-1: first\n- [ ] ag-1: second');

    expect(document.byId.get('ag-1')?.title).toBe('first');
  });
});

describe('nesting', () => {
  const plan = [
    '- [ ] one',
    '    - [ ] two',
    '        - [ ] three',
    '            - [ ] four',
    '                - [ ] five',
    '- [ ] sibling',
  ].join('\n');

  it('nests to any depth', () => {
    expect(tasks(plan).map((task) => task.depth)).toEqual([0, 1, 2, 3, 4, 0]);
  });

  it('makes a deeper bullet a child', () => {
    const document = parseTaskBoard('- [ ] parent\n    - [ ] child');

    expect(document.items).toHaveLength(1);
    expect((document.items[0] as TaskNode).children).toHaveLength(1);
    expect(flattenTasks(document.items).map((task) => task.title)).toEqual(['parent', 'child']);
  });

  it('reads relative indentation, not a fixed step', () => {
    expect(tasks('- [ ] one\n  - [ ] two\n      - [ ] three').map((task) => task.depth)).toEqual([
      0, 1, 2,
    ]);
  });

  it('records the ancestor path on every node', () => {
    expect(byTitle(plan, 'three').path).toEqual(['one', 'two']);
  });

  it('points every node at its top-level ancestor', () => {
    const document = parseTaskBoard(plan);
    const root = document.tasks[0];

    expect(byTitle(plan, 'five').rootKey).toBe(root.key);
    expect(root.rootKey).toBe(root.key);
    expect(byTitle(plan, 'sibling').rootKey).toBe(byTitle(plan, 'sibling').key);
  });
});

describe('epics', () => {
  // Nothing declares an epic. One is a top-level item other items hang off.
  const plan = [
    '- [ ] First epic',
    '    - [ ] a child',
    '- [ ] A top-level leaf',
    '- [ ] Second epic',
    '    - [ ] another child',
    '        - [ ] a grandchild',
  ].join('\n');

  it('are the top-level items that have children', () => {
    expect(parseTaskBoard(plan).epics.map((epic) => epic.title)).toEqual([
      'First epic',
      'Second epic',
    ]);
  });

  it('do not include a top-level item with nothing under it', () => {
    expect(parseTaskBoard(plan).epics.map((epic) => epic.title)).not.toContain('A top-level leaf');
  });

  it('do not include a nested parent', () => {
    expect(parseTaskBoard(plan).epics.map((epic) => epic.title)).not.toContain('another child');
  });

  it('gather their whole subtree under one root key', () => {
    const document = parseTaskBoard(plan);
    const second = document.epics[1];

    expect(
      document.tasks.filter((task) => task.rootKey === second.key).map((task) => task.title)
    ).toEqual(['Second epic', 'another child', 'a grandchild']);
  });

  it('are not invented by a malformed line', () => {
    expect(parseTaskBoard('- [?] junk\n    - [ ] child').epics).toEqual([]);
  });
});

describe('descriptions', () => {
  const plan = [
    '- [ ] AG-1: Delete the engine',
    '    Remove the runner, the trade workflows and the trade machinery.',
    '    The API must still boot and serve the frontend routes.',
    '',
    '    A second paragraph.',
    '    - [ ] Prune the schema package',
    '- [ ] Another',
  ].join('\n');

  it('attaches indented prose to the node above it', () => {
    expect(byTitle(plan, 'Delete the engine').description).toEqual([
      'Remove the runner, the trade workflows and the trade machinery. The API must still boot and serve the frontend routes.',
      'A second paragraph.',
    ]);
  });

  it('does not turn prose into a child', () => {
    const parent = byTitle(plan, 'Delete the engine');

    expect(parent.children).toHaveLength(1);
    expect((parent.children[0] as TaskNode).title).toBe('Prune the schema package');
  });

  it('leaves a node with no prose without a description', () => {
    expect(byTitle(plan, 'Another').description).toEqual([]);
  });
});

describe('description ownership by indentation', () => {
  const plan = ['- [ ] outer', '    - [ ] inner', '        deep prose', '    shallow prose'].join(
    '\n'
  );

  it('gives the deeper line to the inner node', () => {
    expect(byTitle(plan, 'inner').description).toEqual(['deep prose']);
  });

  it('gives the shallower line back to the outer node', () => {
    expect(byTitle(plan, 'outer').description).toEqual(['shallow prose']);
  });

  it('still nests a bullet written after the prose', () => {
    const deeper = ['- [ ] outer', '    - [ ] inner', '    prose for outer', '        - [ ] leaf'].join(
      '\n'
    );

    expect(byTitle(deeper, 'leaf').path).toEqual(['outer', 'inner']);
  });
});

describe('fields', () => {
  const line =
    '- [ ] AG-1: Delete the engine   needs: AG-0b, AG-6a   @me   !p1   est: 3d   #risk   due: 2026-04-01   milestone: v1';

  it('reads every field on one line and strips them from the title', () => {
    const task = tasks(line)[0];

    expect(task.title).toBe('Delete the engine');
    expect(task.own.needs).toEqual(['AG-0b', 'AG-6a']);
    expect(task.own.assignees).toEqual(['me']);
    expect(task.own.labels).toEqual(['risk']);
    expect(task.own.priority).toBe(1);
    expect(task.own.due).toBe('2026-04-01');
    expect(task.own.milestone).toBe('v1');
    expect(task.own.estimate).toMatchObject({ value: 3, unit: 'd', days: 3, points: 0, text: '3d' });
  });

  it('accepts the fields in any order', () => {
    const task = tasks('- [ ] Title here #risk milestone: v2 @me est: 2h !high')[0];

    expect(task.title).toBe('Title here');
    expect(task.own.labels).toEqual(['risk']);
    expect(task.own.assignees).toEqual(['me']);
    expect(task.own.priority).toBe(2);
    expect(task.own.milestone).toBe('v2');
    expect(task.own.estimate?.unit).toBe('h');
  });

  it('lets a value run to the next field, title words included', () => {
    // Fields come after the title. Writing one in the middle hands the words
    // that follow it to that field, which is the documented consequence of
    // "a value stops at the next field" and not something to guess around.
    const task = tasks('- [ ] milestone: v2 words after the field @me')[0];

    expect(task.own.milestone).toBe('v2 words after the field');
    expect(task.title).toBe('');
  });

  it('reads every estimate unit, and a bare number as points', () => {
    const parsed = tasks(
      ['- [ ] a est: 4h', '- [ ] b est: 3d', '- [ ] c est: 1w', '- [ ] d est: 5'].join('\n')
    ).map((task) => task.own.estimate);

    expect(parsed[0]).toMatchObject({ unit: 'h', days: 0.5, points: 0 });
    expect(parsed[1]).toMatchObject({ unit: 'd', days: 3, points: 0 });
    expect(parsed[2]).toMatchObject({ unit: 'w', days: 5, points: 0 });
    expect(parsed[3]).toMatchObject({ unit: 'pt', days: 0, points: 5 });
  });

  it('ignores an estimate in a unit the format does not define', () => {
    expect(tasks('- [ ] a est: 3 sprints')[0].own.estimate).toBeUndefined();
  });

  it('runs trigger to the end of the line', () => {
    const task = tasks('- [ ] Wait   trigger: when DW-1c lands and @nobody is around #later')[0];

    expect(task.own.trigger).toBe('when DW-1c lands and @nobody is around #later');
    expect(task.own.assignees).toEqual([]);
    expect(task.own.labels).toEqual([]);
    expect(task.title).toBe('Wait');
  });

  it('runs reason to the end of the line', () => {
    const task = tasks('- [-] Typed checklist subsystem   reason: rejected as over-engineering')[0];

    expect(task.own.reason).toBe('rejected as over-engineering');
    expect(task.title).toBe('Typed checklist subsystem');
    expect(task.status).toBe('canceled');
  });

  it('takes every priority alias', () => {
    const parsed = tasks(
      ['- [ ] a !urgent', '- [ ] b !high', '- [ ] c !med', '- [ ] d !low', '- [ ] e !p4'].join('\n')
    ).map((task) => task.own.priority);

    expect(parsed).toEqual([1, 2, 3, 4, 4]);
  });

  it('leaves a bang that is not a priority in the title', () => {
    expect(tasks('- [ ] Ship it !now')[0].title).toBe('Ship it !now');
  });

  it('leaves an unknown key in the title', () => {
    const task = tasks('- [ ] Rewrite the loader owner: nobody')[0];

    expect(task.title).toBe('Rewrite the loader owner: nobody');
  });

  it('takes several assignees and labels', () => {
    const task = tasks('- [ ] Pair @ann @bo #risk #ui')[0];

    expect(task.own.assignees).toEqual(['ann', 'bo']);
    expect(task.own.labels).toEqual(['risk', 'ui']);
  });

  it('does not read an email address as an assignee', () => {
    expect(tasks('- [ ] Mail ann@example.com about it')[0].own.assignees).toEqual([]);
  });
});

describe('trailing links', () => {
  it('extracts the link before anything looks for a tag', () => {
    const task = tasks('- [ ] Read the spec [spec](doc.mdx#ids)')[0];

    expect(task.link).toEqual({ text: 'spec', href: 'doc.mdx#ids' });
    expect(task.own.labels).toEqual([]);
    expect(task.title).toBe('Read the spec');
  });

  it('keeps the text but drops an href the format will not render', () => {
    const task = tasks('- [ ] Careful [click](javascript:alert)')[0];

    expect(task.link?.text).toBe('click');
    expect(task.link?.href).toBeUndefined();
  });

  it('leaves a target with brackets of its own as plain text', () => {
    const task = tasks('- [ ] Careful [click](javascript:alert(1))')[0];

    expect(task.link).toBeUndefined();
    expect(task.title).toBe('Careful [click](javascript:alert(1))');
  });

  it('allows http, https and mailto', () => {
    const hrefs = tasks(
      [
        '- [ ] a [x](https://example.com)',
        '- [ ] b [x](http://example.com)',
        '- [ ] c [x](mailto:a@b.c)',
      ].join('\n')
    ).map((task) => task.link?.href);

    expect(hrefs).toEqual(['https://example.com', 'http://example.com', 'mailto:a@b.c']);
  });

  it('leaves a link that is not at the end of the line in the title', () => {
    const task = tasks('- [ ] See [spec](doc.mdx) before starting')[0];

    expect(task.link).toBeUndefined();
    expect(task.title).toBe('See [spec](doc.mdx) before starting');
  });
});

describe('inheritance', () => {
  const plan = [
    '- [ ] Epic @ann #core milestone: v1 needs: OTHER est: 2d !p1',
    '    - [ ] Inherits everything inheritable',
    '    - [ ] Overrides @bo #ui milestone: v2',
    '        - [ ] Inherits the override',
  ].join('\n');

  it('flows assignee, label and milestone down', () => {
    const child = byTitle(plan, 'Inherits everything inheritable');

    expect(child.fields.assignees).toEqual(['ann']);
    expect(child.fields.labels).toEqual(['core']);
    expect(child.fields.milestone).toBe('v1');
  });

  it('lets a child override all three', () => {
    const child = byTitle(plan, 'Overrides');

    expect(child.fields.assignees).toEqual(['bo']);
    expect(child.fields.labels).toEqual(['ui']);
    expect(child.fields.milestone).toBe('v2');
  });

  it('passes an override on to the next level', () => {
    const grandchild = byTitle(plan, 'Inherits the override');

    expect(grandchild.fields.assignees).toEqual(['bo']);
    expect(grandchild.fields.milestone).toBe('v2');
  });

  it('never inherits status', () => {
    const done = parseTaskBoard('- [x] parent\n    - [ ] child');

    expect(byTitle('- [x] parent\n    - [ ] child', 'child').status).toBe('todo');
    expect(done.tasks[0].status).toBe('done');
  });

  it('never inherits needs, estimate, priority or due', () => {
    const child = byTitle(plan, 'Inherits everything inheritable');

    expect(child.fields.needs).toEqual([]);
    expect(child.fields.estimate).toBeUndefined();
    expect(child.fields.priority).toBeUndefined();
    expect(child.fields.due).toBeUndefined();
  });

  it('keeps what the line wrote separate from what it inherited', () => {
    const child = byTitle(plan, 'Inherits everything inheritable');

    expect(child.own.assignees).toEqual([]);
    expect(child.fields.assignees).toEqual(['ann']);
  });
});

describe('rollups', () => {
  const plan = [
    '- [ ] Epic',
    '    - [x] one est: 1d',
    '    - [ ] two est: 2d',
    '        - [x] two a est: 4h',
    '    - [-] three est: 1d',
    '- [ ] Other est: 3',
  ].join('\n');

  it('counts every descendant, not only the direct children', () => {
    const epic = byTitle(plan, 'Epic');

    expect(epic.rollup.total).toBe(4);
    expect(epic.rollup.done).toBe(2);
  });

  it('leaves canceled work out of the progress divisor', () => {
    // Three of the four descendants are in scope, two of them are done.
    expect(byTitle(plan, 'Epic').rollup.progress).toBeCloseTo(2 / 3);
  });

  it('sums estimates over the subtree in both dimensions', () => {
    const epic = byTitle(plan, 'Epic');

    expect(epic.rollup.days).toBeCloseTo(1 + 2 + 0.5 + 1);
    expect(byTitle(plan, 'Other').rollup.points).toBe(3);
  });

  it('reports the remaining estimate over work that is not done', () => {
    const epic = byTitle(plan, 'Epic');

    expect(epic.rollup.remainingDays).toBeCloseTo(2 + 1);
  });

  it('totals the whole document', () => {
    const document = parseTaskBoard(plan);

    expect(document.totals.total).toBe(6);
    expect(document.totals.done).toBe(2);
    expect(document.totals.counts.canceled).toBe(1);
  });

  it('gives a leaf an empty rollup and its own estimate', () => {
    const leaf = byTitle(plan, 'two a');

    expect(leaf.rollup.total).toBe(0);
    expect(leaf.rollup.progress).toBe(0);
    expect(leaf.rollup.days).toBeCloseTo(0.5);
  });
});

describe('ready and blocked', () => {
  const plan = [
    '- [x] A-1: first',
    '- [ ] A-2: second needs: A-1',
    '- [ ] A-3: third needs: A-2',
    '- [!] A-4: fourth',
    '- [ ] A-5: fifth needs: NOT-IN-THIS-DOCUMENT',
    '- [ ] A-6: sixth needs: a-1',
  ].join('\n');

  it('calls a todo with every dependency done ready', () => {
    expect(byTitle(plan, 'second').ready).toBe(true);
    expect(byTitle(plan, 'second').blocked).toBe(false);
  });

  it('blocks a todo whose dependency is not done', () => {
    expect(byTitle(plan, 'third').blocked).toBe(true);
    expect(byTitle(plan, 'third').ready).toBe(false);
    expect(byTitle(plan, 'third').unmetNeeds).toEqual(['A-2']);
  });

  it('treats an explicit marker as blocked', () => {
    expect(byTitle(plan, 'fourth').blocked).toBe(true);
    expect(byTitle(plan, 'fourth').ready).toBe(false);
  });

  it('counts a dependency the document does not contain as satisfied', () => {
    expect(byTitle(plan, 'fifth').ready).toBe(true);
    expect(byTitle(plan, 'fifth').unmetNeeds).toEqual([]);
  });

  it('matches dependency ids case-insensitively', () => {
    expect(byTitle(plan, 'sixth').ready).toBe(true);
  });

  it('rolls ready and blocked counts up to the parent', () => {
    const nested = ['- [ ] Epic', '    - [ ] X-1: a', '    - [ ] b needs: X-1', '    - [!] c'].join(
      '\n'
    );
    const epic = byTitle(nested, 'Epic');

    expect(epic.rollup.ready).toBe(1);
    expect(epic.rollup.blocked).toBe(2);
  });
});

describe('the done-over-open-children inconsistency', () => {
  const plan = ['- [x] Epic', '    - [ ] still open', '    - [x] closed'].join('\n');

  it('surfaces the disagreement without changing either side', () => {
    const document = parseTaskBoard(plan);
    const epic = byTitle(plan, 'Epic');

    expect(epic.status).toBe('done');
    expect(epic.inconsistent).toBe(true);
    expect(byTitle(plan, 'still open').status).toBe('todo');
    expect(document.inconsistencies.map((task) => task.title)).toEqual(['Epic']);
  });

  it('says nothing when the only open children are canceled', () => {
    expect(byTitle('- [x] Epic\n    - [-] dropped', 'Epic').inconsistent).toBe(false);
  });

  it('says nothing about an open parent over open children', () => {
    expect(byTitle('- [ ] Epic\n    - [ ] open', 'Epic').inconsistent).toBe(false);
  });
});

describe('the copy payload', () => {
  it('is the verbatim source line, indentation included', () => {
    const source = '- [ ] AG-1: Delete   @me   #risk\n    - [x]   Prune the schema  package  ';
    const parsed = tasks(source);

    expect(parsed[0].source).toBe('- [ ] AG-1: Delete   @me   #risk');
    expect(parsed[1].source).toBe('    - [x]   Prune the schema  package  ');
    expect(source.split('\n')).toEqual(parsed.map((task) => task.source));
  });

  it('keeps the line intact when the format rewrote the title', () => {
    const task = tasks('-\t[~]\tTabbed\tline\t@me')[0];

    expect(task.source).toBe('-\t[~]\tTabbed\tline\t@me');
  });
});

describe('filter vocabularies', () => {
  it('collects assignees, labels and milestones after inheritance', () => {
    const document = parseTaskBoard(
      ['- [ ] a @ann #core milestone: v1', '    - [ ] b', '- [ ] c @bo #ui milestone: v2'].join('\n')
    );

    expect(document.assignees).toEqual(['ann', 'bo']);
    expect(document.labels).toEqual(['core', 'ui']);
    expect(document.milestones).toEqual(['v1', 'v2']);
  });
});

describe('helpers', () => {
  it('formats the two estimate dimensions separately', () => {
    expect(formatEstimate(2.5, 0)).toBe('2.5d');
    expect(formatEstimate(0, 8)).toBe('8 pts');
    expect(formatEstimate(1, 3)).toBe('1d · 3 pts');
    expect(formatEstimate(0, 0)).toBe('');
  });

  it('cycles a status the way a tick would', () => {
    expect(nextStatus('todo')).toBe('in-progress');
    expect(nextStatus('in-progress')).toBe('done');
    expect(nextStatus('done')).toBe('todo');
    expect(nextStatus('canceled')).toBe('todo');
  });

  it('refuses to complete a node whose children are not done', () => {
    const plan = '- [~] Epic\n    - [ ] open child\n- [~] Other\n    - [x] closed child';

    expect(canComplete(byTitle(plan, 'Epic'))).toBe(false);
    expect(openInside(byTitle(plan, 'Epic'))).toBe(1);
    expect(nextStatusFor(byTitle(plan, 'Epic'))).toBe('todo');

    expect(canComplete(byTitle(plan, 'Other'))).toBe(true);
    expect(nextStatusFor(byTitle(plan, 'Other'))).toBe('done');
  });

  it('leaves a leaf free to be completed', () => {
    const leaf = byTitle('- [~] on its own', 'on its own');

    expect(canComplete(leaf)).toBe(true);
    expect(nextStatusFor(leaf)).toBe('done');
  });
});
