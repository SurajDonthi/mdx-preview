/**
 * The parser has no error path, and this is where that claim is tested.
 *
 * A plan is written while it is being thought about, so at any moment half of
 * it is half-typed. Every input below is one somebody will eventually paste in,
 * and each case asserts two things: that nothing threw, and that what came back
 * still describes the input rather than an empty board standing in for it.
 */
import { describe, expect, it } from 'vitest';

import { parseTaskBoard, type TaskItem } from '../src/parseTasks';

/** Parses and fails loudly if anything at all escaped. */
function safely(source: unknown) {
  expect(() => parseTaskBoard(source)).not.toThrow();
  return parseTaskBoard(source);
}

/** Every line of the source, in order, whether task or not. */
function everyLine(items: TaskItem[]): TaskItem[] {
  const result: TaskItem[] = [];
  const walk = (list: TaskItem[]) => {
    for (const item of list) {
      result.push(item);
      if (item.kind === 'task') walk(item.children);
    }
  };
  walk(items);
  return result.sort((left, right) => left.line - right.line);
}

describe('degenerate input', () => {
  it('handles an empty string', () => {
    const document = safely('');

    expect(document.tasks).toEqual([]);
    expect(document.totals.total).toBe(0);
  });

  it('handles whitespace only', () => {
    expect(safely('   \n\t\n  \t  ').tasks).toEqual([]);
  });

  it('handles a value that is not a string at all', () => {
    for (const value of [undefined, null, 42, {}, [], true, Symbol('x')]) {
      expect(safely(value).tasks).toEqual([]);
    }
  });

  it('handles a document with no tasks in it', () => {
    const document = safely('just some prose\nand a second line');

    expect(document.tasks).toEqual([]);
    expect(document.items).toHaveLength(2);
    expect(document.items.every((item) => item.kind === 'line')).toBe(true);
  });
});

describe('malformed lines', () => {
  it('keeps an unterminated bracket in place', () => {
    const document = safely('- [ ] fine\n- [x unterminated\n- [ ] fine again');
    const lines = everyLine(document.items);

    expect(document.tasks).toHaveLength(2);
    expect(lines[1].kind).toBe('line');
    expect(lines[1].source).toBe('- [x unterminated');
    // In place: still the second row, not moved to the end or dropped.
    expect(lines.map((item) => item.line)).toEqual([0, 1, 2]);
  });

  it('keeps a checkbox with no bullet in place', () => {
    const document = safely('[x] no bullet here');

    expect(document.tasks).toHaveLength(0);
    expect(document.items[0].source).toBe('[x] no bullet here');
  });

  it('keeps a line that is only a field, and reads it as one', () => {
    const document = safely('- [ ] needs: A, B');

    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].title).toBe('');
    expect(document.tasks[0].id).toBeUndefined();
    expect(document.tasks[0].own.needs).toEqual(['A', 'B']);
  });

  it('handles a checkbox with nothing after it', () => {
    // A real, empty, untitled task: the marker is valid, so the line is not
    // malformed. The board renders it with no title rather than hiding it.
    const document = safely('- [ ]');

    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].title).toBe('');
  });

  it('handles a marker with several characters', () => {
    expect(safely('- [xx] two characters').tasks).toHaveLength(0);
  });

  it('nests a malformed line under the task it was written beneath', () => {
    const document = safely('- [ ] parent\n    - [?] malformed');
    const parent = document.tasks[0];

    expect(parent.children).toHaveLength(1);
    expect(parent.children[0].kind).toBe('line');
    expect(parent.children[0].source).toBe('    - [?] malformed');
  });
});

describe('hostile whitespace', () => {
  it('handles tabs mixed with spaces', () => {
    const document = safely('- [ ] one\n\t- [ ] two\n \t   - [ ] three');

    expect(document.tasks.map((task) => task.title)).toEqual(['one', 'two', 'three']);
    expect(document.tasks.map((task) => task.depth)).toEqual([0, 1, 2]);
  });

  it('handles CRLF endings without keeping the carriage return', () => {
    const document = safely('- [ ] one\r\n    - [ ] two\r\n');

    expect(document.tasks.map((task) => task.title)).toEqual(['one', 'two']);
    expect(document.tasks[0].source).toBe('- [ ] one');
  });

  it('handles a lone carriage return as a line ending', () => {
    expect(safely('- [ ] one\r- [ ] two').tasks).toHaveLength(2);
  });

  it('handles absurd indentation', () => {
    const document = safely(`- [ ] shallow\n${' '.repeat(4000)}- [ ] deep`);

    expect(document.tasks).toHaveLength(2);
    expect(document.tasks[1].depth).toBe(1);
  });

  it('handles a thousand levels of real nesting', () => {
    const lines: string[] = [];
    for (let level = 0; level < 1000; level += 1) {
      lines.push(`${' '.repeat(level * 4)}- [ ] level ${level}`);
    }
    const document = safely(lines.join('\n'));

    expect(document.tasks).toHaveLength(1000);
    expect(document.tasks[999].depth).toBe(999);
    expect(document.items[0].kind === 'task' && document.items[0].rollup.total).toBe(999);
  });

  it('handles a line of nothing but whitespace between two tasks', () => {
    const document = safely('- [ ] one\n   \n- [ ] two');

    expect(document.tasks).toHaveLength(2);
  });
});

describe('hostile content', () => {
  it('handles unicode, emoji and right-to-left text', () => {
    const document = safely('- [ ] ✅ ناقش الخطة 🚀 @ānn #تصميم');

    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].title).toContain('🚀');
    expect(document.tasks[0].own.assignees).toEqual(['ānn']);
  });

  it('handles nested markdown links', () => {
    const document = safely('- [ ] see [a [b](c)](d) and [e](f)');

    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].title.length).toBeGreaterThan(0);
  });

  it('handles a line that is one long word', () => {
    const document = safely(`- [ ] ${'x'.repeat(20000)}`);

    expect(document.tasks[0].title).toHaveLength(20000);
  });

  it('handles regex metacharacters in every field', () => {
    const document = safely('- [ ] (a|b)*+?[]{}^$ @(x) #(y) needs: (z) trigger: .*');

    expect(document.tasks).toHaveLength(1);
    expect(document.tasks[0].own.trigger).toBe('.*');
  });

  it('handles a dependency that names itself', () => {
    const document = safely('- [ ] A-1: loops needs: A-1');

    expect(document.tasks[0].blocked).toBe(true);
    expect(document.tasks[0].unmetNeeds).toEqual(['A-1']);
  });

  it('handles a dependency cycle between two tasks', () => {
    const document = safely('- [ ] A: one needs: B\n- [ ] B: two needs: A');

    expect(document.tasks.every((task) => task.blocked)).toBe(true);
  });

  it('handles every field written twice', () => {
    const document = safely('- [ ] t @a @a #l #l needs: X, X est: 1d est: 2d');

    expect(document.tasks[0].own.assignees).toEqual(['a']);
    expect(document.tasks[0].own.labels).toEqual(['l']);
    expect(document.tasks[0].own.needs).toEqual(['X']);
    // The last estimate wins, rather than the two being added together.
    expect(document.tasks[0].own.estimate?.value).toBe(2);
  });

  it('handles a description with no task above it', () => {
    const document = safely('    orphan prose\n- [ ] task');

    expect(document.items[0].kind).toBe('line');
    expect(document.tasks[0].description).toEqual([]);
  });
});

describe('size', () => {
  it('parses ten thousand lines', () => {
    const lines: string[] = [];
    for (let index = 0; index < 10_000; index += 1) {
      lines.push(index % 3 === 0 ? `- [ ] T-${index}: task ${index} needs: T-${index - 3}` : '');
      lines.push(index % 7 === 0 ? `    prose for ${index}` : `- [?] junk ${index}`);
    }
    const source = lines.join('\n');

    const started = Date.now();
    const document = safely(source);
    expect(Date.now() - started).toBeLessThan(5000);

    expect(document.tasks.length).toBeGreaterThan(3000);
    expect(document.totals.total).toBe(document.tasks.length);
  });
});
