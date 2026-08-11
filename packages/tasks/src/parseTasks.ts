/**
 * The ```tasks fence format.
 *
 * The format is deliberately the checklist people already write in an
 * implementation plan, so that a plan is a board without being rewritten:
 *
 * ```
 * ## AG — Agentic platform
 * - [x] AG-0a Branch cut and pushed
 * - [~] AG-0b Agentic code into git @me #infra
 * - [ ] AG-1 The deletion — needs: AG-0b #risk:high [details](details/agentic.mdx)
 * - [!] MX-6 TaskBoard — blocked on extension config support
 * - [→] DW-4 Multi-layer contours (trigger: DW-1c)
 * ```
 *
 * - `#` .. `######` starts a group. Anything before the first heading belongs
 *   to an unnamed group, so a bare checklist still parses.
 * - `- [m] rest` is a task; `*` and `+` are bullets too. Markers: nothing or a
 *   space is todo, `~` in progress, `x` done, `!` blocked, `→` (or `>`)
 *   deferred. An unrecognised marker is *not* a task - it is kept as text.
 * - A leading `[A-Z][A-Za-z0-9]*[-.][A-Za-z0-9.]+` token is the task id.
 * - `needs: A, B` (any case, anywhere) lists dependency ids.
 * - `@name` is the owner, `#tag` and `#key:value` are tags.
 * - A markdown link at the end of the line is the task's detail link.
 * - Everything left over is the title, and is inline markdown.
 *
 * **Nothing here throws, ever.** A board rendered from a document is a preview
 * of that document: a line the parser cannot read is kept verbatim as a note
 * rather than dropped or reported, because the reader can see for themselves
 * what they typed and a thrown component would take the whole page with it.
 */

/** Where a task sits, taken from its checkbox marker. */
export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'blocked' | 'deferred';

/** `#tag`, or `#key:value` split into its halves. */
export interface TaskTag {
  /** `risk` in `#risk:high`, `infra` in `#infra`. */
  key: string;
  /** `high` in `#risk:high`; `null` for a bare tag. */
  value: string | null;
  /** How it was written, minus the `#`. */
  label: string;
}

/** A markdown link taken off the end of a task line. */
export interface TaskLink {
  href: string;
  label: string;
}

export interface Task {
  /** Stable across renders of the same source; safe as a React key. */
  key: string;
  /** `AG-1`, or `null` when the line does not start with an id token. */
  id: string | null;
  status: TaskStatus;
  /** Inline markdown, with every annotation removed. May be empty. */
  title: string;
  owner: string | null;
  tags: TaskTag[];
  /** Ids from `needs:`, as written. */
  needs: string[];
  link: TaskLink | null;
  /** Label of the group the task was found in; `''` for the unnamed one. */
  group: string;
  /** 1-based line within the fence, for anyone who wants to link back. */
  line: number;
}

/** A line the parser could not read, kept so the document is never lost. */
export interface TaskNote {
  text: string;
  line: number;
}

export type TaskCounts = Record<TaskStatus, number> & { total: number };

export interface TaskGroup {
  /** Unique within the board, even when two groups share a label. */
  id: string;
  /** Heading text, as inline markdown. `''` for the leading unnamed group. */
  label: string;
  line: number;
  tasks: Task[];
  notes: TaskNote[];
  counts: TaskCounts;
  /** Done as a percentage of the group's tasks, rounded. `0` when empty. */
  percent: number;
}

export interface TaskBoardModel {
  groups: TaskGroup[];
  /** Every task, in document order. */
  tasks: Task[];
  /** Tasks that carry an id, keyed by that id exactly as written. */
  byId: Record<string, Task>;
  counts: TaskCounts;
  percent: number;
  /** Distinct owners, sorted. */
  owners: string[];
  /** Distinct tag labels, sorted. */
  tags: string[];
}

const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
const TASK = /^\s*[-*+]\s*\[(.?)\]\s?(.*)$/;
const ID = /^([A-Z][A-Za-z0-9]*[-.][A-Za-z0-9.]+)(?=\s|$)/;
/** A trailing `[label](href)`, with an optional `"title"` markdown allows. */
const TRAILING_LINK = /\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)\s*$/;
const NEEDS = /\bneeds\s*:\s*([A-Za-z0-9][\w.-]*(?:\s*,\s*[A-Za-z0-9][\w.-]*)*)/gi;
const OWNER = /(^|\s)@([A-Za-z0-9][\w.-]*)/g;
const TAG = /(^|\s)#([A-Za-z0-9][\w./-]*(?::[A-Za-z0-9][\w./-]*)?)/g;

const MARKERS: Record<string, TaskStatus> = {
  '': 'todo',
  ' ': 'todo',
  '~': 'in-progress',
  x: 'done',
  X: 'done',
  '!': 'blocked',
  '→': 'deferred',
  '>': 'deferred',
};

/** The lanes, in the order a reader wants them. Done is deliberately last. */
export const TASK_STATUS_ORDER: TaskStatus[] = [
  'in-progress',
  'todo',
  'blocked',
  'deferred',
  'done',
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  'in-progress': 'In progress',
  todo: 'Todo',
  blocked: 'Blocked',
  deferred: 'Deferred',
  done: 'Done',
};

function emptyCounts(): TaskCounts {
  return { total: 0, todo: 0, 'in-progress': 0, done: 0, blocked: 0, deferred: 0 };
}

function count(tasks: Task[]): TaskCounts {
  const counts = emptyCounts();
  for (const task of tasks) {
    counts.total += 1;
    counts[task.status] += 1;
  }
  return counts;
}

function percentOf(counts: TaskCounts): number {
  return counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Whitespace, orphaned brackets and dangling separators left where an
 * annotation used to be. `A — needs: B` reads as `A`, not as `A —`.
 */
function tidy(text: string): string {
  return text
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s–—\-:·|,]+/, '')
    .replace(/[\s–—\-:·|,]+$/, '')
    .trim();
}

function parseTags(raw: string[]): TaskTag[] {
  return raw.map((label) => {
    const at = label.indexOf(':');
    if (at <= 0 || at === label.length - 1) return { key: label, value: null, label };
    return { key: label.slice(0, at), value: label.slice(at + 1), label };
  });
}

/** Reads one `- [m] rest` body. Total: anything unreadable comes back as text. */
function parseTaskBody(rest: string, status: TaskStatus, group: string, line: number): Task {
  let text = rest;

  const linkMatch = TRAILING_LINK.exec(text);
  let link: TaskLink | null = null;
  if (linkMatch && linkMatch[2]) {
    link = { href: linkMatch[2], label: linkMatch[1] || linkMatch[2] };
    text = text.slice(0, linkMatch.index);
  }

  const needs: string[] = [];
  text = text.replace(NEEDS, (_match, list: string) => {
    for (const part of list.split(',')) {
      const id = part.trim();
      if (id) needs.push(id);
    }
    return ' ';
  });

  let owner: string | null = null;
  text = text.replace(OWNER, (_match, lead: string, name: string) => {
    owner ??= name;
    return lead ? ' ' : '';
  });

  const tagLabels: string[] = [];
  text = text.replace(TAG, (_match, lead: string, label: string) => {
    tagLabels.push(label);
    return lead ? ' ' : '';
  });

  text = tidy(text);

  let id: string | null = null;
  const idMatch = ID.exec(text);
  if (idMatch) {
    id = idMatch[1];
    text = tidy(text.slice(idMatch[1].length));
  }

  return {
    key: `${line}:${id ?? text.slice(0, 32)}`,
    id,
    status,
    title: text,
    owner,
    tags: parseTags(tagLabels),
    needs,
    link,
    group,
    line,
  };
}

/**
 * Reads a fence body into a board. Never throws and never drops a line: what
 * is not a heading or a task becomes a note on the group it was written in.
 */
export function parseTaskBoard(source: string): TaskBoardModel {
  const text = typeof source === 'string' ? source : '';
  const groups: TaskGroup[] = [];
  const tasks: Task[] = [];

  let current: TaskGroup | null = null;
  const open = (label: string, line: number): TaskGroup => {
    const group: TaskGroup = {
      id: `${slugify(label) || 'group'}-${groups.length}`,
      label,
      line,
      tasks: [],
      notes: [],
      counts: emptyCounts(),
      percent: 0,
    };
    groups.push(group);
    current = group;
    return group;
  };
  const target = (line: number): TaskGroup => current ?? open('', line);

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = index + 1;
    if (raw.trim() === '') continue;

    const heading = HEADING.exec(raw);
    if (heading) {
      open(heading[2].replace(/\s+#+\s*$/, '').trim(), line);
      continue;
    }

    const task = TASK.exec(raw);
    const status = task ? MARKERS[task[1]] : undefined;
    if (!task || !status) {
      target(line).notes.push({ text: raw.trim(), line });
      continue;
    }

    const group = target(line);
    const parsed = parseTaskBody(task[2], status, group.label, line);
    group.tasks.push(parsed);
    tasks.push(parsed);
  }

  const byId: Record<string, Task> = {};
  const owners = new Set<string>();
  const tags = new Set<string>();
  for (const task of tasks) {
    if (task.id && !(task.id in byId)) byId[task.id] = task;
    if (task.owner) owners.add(task.owner);
    for (const tag of task.tags) tags.add(tag.label);
  }

  for (const group of groups) {
    group.counts = count(group.tasks);
    group.percent = percentOf(group.counts);
  }

  const counts = count(tasks);
  return {
    groups,
    tasks,
    byId,
    counts,
    percent: percentOf(counts),
    owners: [...owners].sort(),
    tags: [...tags].sort(),
  };
}

/** The task an id names, matched without regard to case. */
export function findTask(board: TaskBoardModel, id: string): Task | null {
  if (!id) return null;
  const direct = board.byId[id];
  if (direct) return direct;
  const wanted = id.toLowerCase();
  for (const key of Object.keys(board.byId)) {
    if (key.toLowerCase() === wanted) return board.byId[key];
  }
  return null;
}

/**
 * Whether nothing in this document is still standing between the reader and
 * the task. An id the document does not contain is not something to wait for -
 * the board can only speak for what it can see.
 */
export function isReady(board: TaskBoardModel, task: Task): boolean {
  if (task.status !== 'todo') return false;
  return task.needs.every((id) => {
    const dependency = findTask(board, id);
    return !dependency || dependency.status === 'done';
  });
}

/** Todo tasks with every dependency satisfied: what can be picked up now. */
export function readyTasks(board: TaskBoardModel): Task[] {
  return board.tasks.filter((task) => isReady(board, task));
}
