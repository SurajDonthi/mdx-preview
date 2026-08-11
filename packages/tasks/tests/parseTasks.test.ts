/**
 * The fence parser, on its own.
 *
 * The format is the checklist people already write in an implementation plan,
 * so the parser's job is to recognise what is there and to keep everything it
 * does not recognise. The last group of tests is the important one: a line the
 * parser cannot read has to survive as text, because a plan is a document
 * first and a board second.
 */

import { describe, expect, it } from 'vitest';

import { parseTaskBoard, readyTasks } from '../src/parseTasks';

const single = (line: string) => {
  const board = parseTaskBoard(line);
  return board.tasks[0];
};

describe('markers', () => {
  it('reads every status marker', () => {
    const board = parseTaskBoard(
      [
        '- [ ] todo one',
        '- [~] doing one',
        '- [x] done one',
        '- [X] done two',
        '- [!] blocked one',
        '- [→] deferred one',
        '- [>] deferred two',
      ].join('\n')
    );

    expect(board.tasks.map((task) => task.status)).toEqual([
      'todo',
      'in-progress',
      'done',
      'done',
      'blocked',
      'deferred',
      'deferred',
    ]);
  });

  it('accepts an empty marker as todo', () => {
    expect(single('- [] nothing in the box')?.status).toBe('todo');
  });

  it('accepts the other bullet characters', () => {
    const board = parseTaskBoard(['* [x] star', '+ [ ] plus', '  - [~] indented'].join('\n'));

    expect(board.tasks).toHaveLength(3);
    expect(board.tasks.map((task) => task.title)).toEqual(['star', 'plus', 'indented']);
  });

  it('keeps an unknown marker as a note rather than inventing a status', () => {
    const board = parseTaskBoard('- [?] what is this');

    expect(board.tasks).toHaveLength(0);
    expect(board.groups[0].notes.map((note) => note.text)).toEqual(['- [?] what is this']);
  });
});

describe('ids', () => {
  it('takes a leading id token', () => {
    const task = single('- [ ] AG-1 The deletion');

    expect(task.id).toBe('AG-1');
    expect(task.title).toBe('The deletion');
  });

  it('takes ids with digits, dots and mixed case', () => {
    expect(single('- [ ] DW-2c Multi-layer contours')?.id).toBe('DW-2c');
    expect(single('- [ ] MX-6 TaskBoard')?.id).toBe('MX-6');
    expect(single('- [ ] C2.1 Framework choice')?.id).toBe('C2.1');
    expect(single('- [ ] INF-8 Auto deploy')?.id).toBe('INF-8');
  });

  it('leaves a task without an id alone', () => {
    const task = single('- [ ] write the release notes');

    expect(task.id).toBeNull();
    expect(task.title).toBe('write the release notes');
  });

  it('does not treat a lower-case or unhyphenated word as an id', () => {
    expect(single('- [ ] ag-1 lower case')?.id).toBeNull();
    expect(single('- [ ] Ship the thing')?.id).toBeNull();
  });
});

describe('annotations', () => {
  it('pulls out needs, owner, tags and the trailing link', () => {
    const task = single(
      '- [ ] AG-1 The deletion — needs: AG-0b, AG-0a @me #risk:high #infra [details](details/agentic.mdx)'
    );

    expect(task.id).toBe('AG-1');
    expect(task.needs).toEqual(['AG-0b', 'AG-0a']);
    expect(task.owner).toBe('me');
    expect(task.tags).toEqual([
      { key: 'risk', value: 'high', label: 'risk:high' },
      { key: 'infra', value: null, label: 'infra' },
    ]);
    expect(task.link).toEqual({ href: 'details/agentic.mdx', label: 'details' });
    expect(task.title).toBe('The deletion');
  });

  it('reads needs case-insensitively and anywhere in the line', () => {
    expect(single('- [ ] NEEDS: A-1 finish the thing')?.needs).toEqual(['A-1']);
    expect(single('- [ ] finish the thing (Needs: A-1)')?.needs).toEqual(['A-1']);
  });

  it('keeps a link that is not at the end inside the title', () => {
    const task = single('- [ ] read [the plan](plan.mdx) before starting');

    expect(task.link).toBeNull();
    expect(task.title).toBe('read [the plan](plan.mdx) before starting');
  });

  it('keeps inline markdown in the title', () => {
    expect(single('- [~] AG-0b **Agentic** code into `git`')?.title).toBe(
      '**Agentic** code into `git`'
    );
  });

  it('takes the first @name as the owner and removes every one of them', () => {
    const task = single('- [ ] pair @ana @ben on the migration');

    expect(task.owner).toBe('ana');
    expect(task.title).toBe('pair on the migration');
  });

  it('does not mistake an anchor inside a link for a tag', () => {
    const task = single('- [ ] AG-2 read it [spec](docs/spec.mdx#ids)');

    expect(task.tags).toEqual([]);
    expect(task.link?.href).toBe('docs/spec.mdx#ids');
  });

  it('leaves a title that is only an id empty', () => {
    const task = single('- [x] AG-0a');

    expect(task.id).toBe('AG-0a');
    expect(task.title).toBe('');
  });
});

describe('groups', () => {
  it('starts a group at a heading and keeps document order', () => {
    const board = parseTaskBoard(
      [
        '## AG — Agentic platform',
        '- [x] AG-0a Branch cut',
        '',
        '## DW — Drywall',
        '- [ ] DW-4 Contours',
      ].join('\n')
    );

    expect(board.groups.map((group) => group.label)).toEqual([
      'AG — Agentic platform',
      'DW — Drywall',
    ]);
    expect(board.groups[0].tasks.map((task) => task.id)).toEqual(['AG-0a']);
    expect(board.groups[1].tasks.map((task) => task.id)).toEqual(['DW-4']);
  });

  it('puts anything before the first heading in an unnamed group', () => {
    const board = parseTaskBoard(['- [ ] loose task', '## Later', '- [ ] MX-1 grouped'].join('\n'));

    expect(board.groups[0].label).toBe('');
    expect(board.groups[0].tasks).toHaveLength(1);
    expect(board.groups[1].label).toBe('Later');
  });

  it('counts progress per group from the markers', () => {
    const board = parseTaskBoard(
      ['## S', '- [x] a', '- [x] b', '- [~] c', '- [ ] d'].join('\n')
    );

    expect(board.groups[0].counts).toMatchObject({
      total: 4,
      done: 2,
      'in-progress': 1,
      todo: 1,
      blocked: 0,
      deferred: 0,
    });
    expect(board.groups[0].percent).toBe(50);
  });

  it('gives every group a distinct id even when labels repeat', () => {
    const board = parseTaskBoard(['## Same', '- [ ] a', '## Same', '- [ ] b'].join('\n'));

    expect(board.groups).toHaveLength(2);
    expect(board.groups[0].id).not.toBe(board.groups[1].id);
  });

  it('accepts every heading level and drops closing hashes', () => {
    const board = parseTaskBoard(['# One #', '- [ ] a', '### Three', '- [ ] b'].join('\n'));

    expect(board.groups.map((group) => group.label)).toEqual(['One', 'Three']);
  });
});

describe('lines the parser cannot read', () => {
  it('keeps them as notes, in order, without throwing', () => {
    const board = parseTaskBoard(
      [
        '## Stage',
        'A paragraph explaining the stage.',
        '- a bullet that is not a task',
        '- [ ] AG-1 a real one',
        '> a quote',
      ].join('\n')
    );

    expect(board.tasks).toHaveLength(1);
    expect(board.groups[0].notes.map((note) => note.text)).toEqual([
      'A paragraph explaining the stage.',
      '- a bullet that is not a task',
      '> a quote',
    ]);
  });

  it('drops blank lines rather than keeping them as notes', () => {
    const board = parseTaskBoard('text\n\n\nmore text');

    expect(board.groups[0].notes).toHaveLength(2);
  });

  it('returns an empty board for an empty fence', () => {
    for (const source of ['', '   ', '\n\n']) {
      const board = parseTaskBoard(source);
      expect(board.groups).toEqual([]);
      expect(board.tasks).toEqual([]);
    }
  });

  it('returns a group with no tasks for a fence with only a heading', () => {
    const board = parseTaskBoard('## Nothing here yet');

    expect(board.tasks).toEqual([]);
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0].label).toBe('Nothing here yet');
    expect(board.groups[0].percent).toBe(0);
  });

  it('never throws on input that is not a string', () => {
    for (const source of [undefined, null, 42, {}, []] as unknown[]) {
      expect(() => parseTaskBoard(source as string)).not.toThrow();
      expect(parseTaskBoard(source as string).tasks).toEqual([]);
    }
  });

  it('survives a line of punctuation', () => {
    expect(() => parseTaskBoard('- [ ] ****** @@@ ### needs: ,,,')).not.toThrow();
  });
});

describe('dependencies', () => {
  const board = parseTaskBoard(
    [
      '- [x] A-1 first',
      '- [~] A-2 second',
      '- [ ] A-3 third — needs: A-1',
      '- [ ] A-4 fourth — needs: A-2',
      '- [ ] A-5 fifth — needs: A-1, A-2',
      '- [ ] A-6 sixth',
      '- [ ] A-7 seventh — needs: NOPE-9',
      '- [!] A-8 eighth — needs: A-1',
      '- [ ] A-9 ninth — needs: a-1',
    ].join('\n')
  );

  it('resolves a dependency to the task it names', () => {
    const third = board.byId['A-3'];

    expect(third.needs).toEqual(['A-1']);
    expect(board.byId['A-1'].title).toBe('first');
  });

  it('reports ready tasks as the todo ones with every dependency done', () => {
    expect(readyTasks(board).map((task) => task.id)).toEqual(['A-3', 'A-6', 'A-7', 'A-9']);
  });

  it('excludes a task blocked by an unfinished dependency', () => {
    expect(readyTasks(board).map((task) => task.id)).not.toContain('A-4');
    expect(readyTasks(board).map((task) => task.id)).not.toContain('A-5');
  });

  it('excludes tasks that are not todo, whatever their dependencies', () => {
    const ids = readyTasks(board).map((task) => task.id);

    expect(ids).not.toContain('A-1');
    expect(ids).not.toContain('A-2');
    expect(ids).not.toContain('A-8');
  });

  it('treats an id the document does not know as nothing to wait for', () => {
    expect(readyTasks(board).map((task) => task.id)).toContain('A-7');
  });

  it('matches dependency ids without regard to case', () => {
    expect(readyTasks(board).map((task) => task.id)).toContain('A-9');
  });
});

describe('the whole sample', () => {
  const board = parseTaskBoard(
    [
      '## AG — Agentic platform',
      '- [x] AG-0a Branch cut and pushed',
      '- [~] AG-0b Agentic code into git @me #infra',
      '- [ ] AG-1 The deletion — needs: AG-0b #risk:high [details](details/agentic-platform.mdx)',
      '- [!] MX-6 TaskBoard — blocked on extension config support',
      '- [→] DW-4 Multi-layer contours (trigger: DW-1c)',
    ].join('\n')
  );

  it('reads it the way the README says it does', () => {
    expect(board.tasks.map((task) => [task.id, task.status, task.title])).toEqual([
      ['AG-0a', 'done', 'Branch cut and pushed'],
      ['AG-0b', 'in-progress', 'Agentic code into git'],
      ['AG-1', 'todo', 'The deletion'],
      ['MX-6', 'blocked', 'TaskBoard — blocked on extension config support'],
      ['DW-4', 'deferred', 'Multi-layer contours (trigger: DW-1c)'],
    ]);
    expect(board.owners).toEqual(['me']);
    expect(board.tags).toEqual(['infra', 'risk:high']);
    expect(readyTasks(board)).toEqual([]);
  });

  it('records the source line of every task', () => {
    expect(board.tasks.map((task) => task.line)).toEqual([2, 3, 4, 5, 6]);
  });
});
