/**
 * The `tasks` fence parser.
 *
 * A plan checklist is one node type nested by indentation. Everything the board
 * shows beyond that - progress, readiness, estimate totals, inherited owners -
 * is derived here and never authored, so the file stays a file somebody can
 * edit by hand and an agent can rewrite line by line.
 *
 * Two rules shape most of the code below.
 *
 * **Nothing here throws.** A plan is written while it is being thought about, so
 * half of every keystroke's worth of input is malformed by definition. A line
 * this parser cannot read becomes a plain line at exactly the position it was
 * written, and the rest of the document parses around it. There is no error
 * path and no partial failure - `parseTaskBoard` always returns a document.
 *
 * **Nothing is guessed.** An unrecognised checkbox marker is not a task with an
 * invented status; it is a plain line. A leading word without a colon is not an
 * id. A `key: value` whose key is not one this format defines is not a field, it
 * is part of the title - which is what keeps `Fix the parser: it drops rows`
 * intact.
 */

/** The six markers a checkbox can carry, in the order the board reports them. */
export type TaskStatus =
  | 'todo'
  | 'in-progress'
  | 'done'
  | 'blocked'
  | 'deferred'
  | 'canceled';

export const TASK_STATUSES: TaskStatus[] = [
  'todo',
  'in-progress',
  'done',
  'blocked',
  'deferred',
  'canceled',
];

/** Human labels for the statuses, used by the board and by group headings. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  'in-progress': 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  deferred: 'Deferred',
  canceled: 'Canceled',
};

/** The marker each status is written with, for round-tripping an edit. */
export const TASK_STATUS_MARKERS: Record<TaskStatus, string> = {
  todo: ' ',
  'in-progress': '~',
  done: 'x',
  blocked: '!',
  deferred: '→',
  canceled: '-',
};

const STATUS_BY_MARKER: Record<string, TaskStatus> = {
  ' ': 'todo',
  '~': 'in-progress',
  x: 'done',
  X: 'done',
  '!': 'blocked',
  '→': 'deferred',
  '>': 'deferred',
  '-': 'canceled',
};

/** Priority aliases. `!p1` is the canonical spelling; the words are sugar. */
const PRIORITY_BY_WORD: Record<string, 1 | 2 | 3 | 4> = {
  p1: 1,
  p2: 2,
  p3: 3,
  p4: 4,
  urgent: 1,
  high: 2,
  med: 3,
  medium: 3,
  low: 4,
};

export const TASK_PRIORITY_LABELS: Record<number, string> = {
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
};

/**
 * Keys that are fields. Deliberately a closed set: any other `word: value` is
 * ordinary title text, because a title is far more likely to contain a colon
 * than a document is to invent a new field.
 */
const FIELD_KEYS = ['needs', 'est', 'due', 'milestone', 'trigger', 'reason'] as const;
type FieldKey = (typeof FIELD_KEYS)[number];

/** The two fields whose value is free text and therefore runs to end of line. */
const FREE_TEXT_KEYS = new Set<FieldKey>(['trigger', 'reason']);

/** A tab advances to the next multiple of this, as an editor would render it. */
const TAB_WIDTH = 4;

/** Hours in a working day and days in a working week, for estimate rollups. */
const HOURS_PER_DAY = 8;
const DAYS_PER_WEEK = 5;

/**
 * Keeps `javascript:`, `data:` and every other scheme out of an href.
 *
 * A relative target has no scheme at all and is always allowed: the documents
 * this format lives in link to their neighbours far more often than to the web.
 */
export function safeHref(href: string): string | undefined {
  const value = href.trim();
  if (!value) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value);
  if (!scheme) return value;
  const name = scheme[1].toLowerCase();
  return name === 'http' || name === 'https' || name === 'mailto' ? value : undefined;
}

/** An estimate, kept in both dimensions so the two never get added together. */
export interface TaskEstimate {
  /** The number as written. */
  value: number;
  /** `h` | `d` | `w` for time, `pt` for a bare number. */
  unit: 'h' | 'd' | 'w' | 'pt';
  /** Time estimates in days; `0` for points. */
  days: number;
  /** Point estimates; `0` for time. */
  points: number;
  /** The value exactly as it was written, for display. */
  text: string;
}

/** A trailing markdown link lifted off the end of a task line. */
export interface TaskLink {
  text: string;
  /** Absent when the href used a scheme this format will not render. */
  href?: string;
}

/** The fields one line carries, before or after inheritance. */
export interface TaskFields {
  assignees: string[];
  labels: string[];
  milestone?: string;
  needs: string[];
  estimate?: TaskEstimate;
  due?: string;
  trigger?: string;
  reason?: string;
  priority?: 1 | 2 | 3 | 4;
}

/** What a subtree adds up to. Every number here is derived, never authored. */
export interface TaskRollup {
  /** Descendants, excluding the node itself. */
  total: number;
  /** Descendants marked done. */
  done: number;
  /** Descendants by status. */
  counts: Record<TaskStatus, number>;
  /** Descendants that are ready to start. */
  ready: number;
  /** Descendants that are blocked. */
  blocked: number;
  /** `done / (total - canceled)`, or 0 when there is nothing to divide by. */
  progress: number;
  /** Time estimates over the subtree, this node included. */
  days: number;
  /** Point estimates over the subtree, this node included. */
  points: number;
  /** The same two sums restricted to work that is not done. */
  remainingDays: number;
  remainingPoints: number;
}

/** A line the parser could not read as a task. It keeps its place. */
export interface TaskPlainLine {
  kind: 'line';
  key: string;
  /** Zero-based index of the line in the source. */
  line: number;
  /** The line exactly as it was written, indentation included. */
  source: string;
  /** The line without its indentation. */
  text: string;
  indent: number;
  depth: number;
  parentKey?: string;
}

export interface TaskNode {
  kind: 'task';
  /** Stable within one parse; the line number is what makes it unique. */
  key: string;
  line: number;
  /** The line exactly as it was written. This is what the copy button hands over. */
  source: string;
  indent: number;
  depth: number;
  status: TaskStatus;
  /** Only set when the line actually wrote one, ending in a colon. */
  id?: string;
  title: string;
  link?: TaskLink;
  /** Fields written on this line. */
  own: TaskFields;
  /** Fields after `@assignee`, `#label` and `milestone:` have flowed down. */
  fields: TaskFields;
  /** Paragraphs of indented prose written under this line. */
  description: string[];
  children: TaskItem[];
  parentKey?: string;
  /**
   * The key of the top-level ancestor this node hangs off - its own when it is
   * itself top-level.
   *
   * There is no epic type in this format, so an epic is exactly this: a
   * top-level item that has children. Scoping the board to one is a filter over
   * `rootKey`.
   */
  rootKey: string;
  /** Titles of the ancestors, outermost first. Board cards show them as context. */
  path: string[];
  /** Dependencies the document contains and has not finished. */
  unmetNeeds: string[];
  /** `[!]`, or a dependency that is not done. */
  blocked: boolean;
  /** To do, with every dependency done or absent from the document. */
  ready: boolean;
  /** Marked done over descendants that are not. Surfaced, never corrected. */
  inconsistent: boolean;
  rollup: TaskRollup;
}

export type TaskItem = TaskNode | TaskPlainLine;

export interface TaskDocument {
  /** Top-level items, in document order, tasks and plain lines alike. */
  items: TaskItem[];
  /** Every task, flattened, in document order. */
  tasks: TaskNode[];
  /** Lower-cased id -> node. The first line to claim an id keeps it. */
  byId: Map<string, TaskNode>;
  byKey: Map<string, TaskItem>;
  /** Filter vocabularies, sorted, after inheritance. */
  assignees: string[];
  labels: string[];
  milestones: string[];
  /**
   * Top-level items that have children, in document order - the epics.
   *
   * Nothing in the format declares one. An epic is a node other nodes hang off,
   * which is a shape rather than a keyword, so this is derived like everything
   * else the board shows.
   */
  epics: TaskNode[];
  /** Totals over the whole document. */
  totals: TaskRollup;
  /** Tasks whose authored status disagrees with their children. */
  inconsistencies: TaskNode[];
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function emptyFields(): TaskFields {
  return { assignees: [], labels: [], needs: [] };
}

function emptyCounts(): Record<TaskStatus, number> {
  return {
    todo: 0,
    'in-progress': 0,
    done: 0,
    blocked: 0,
    deferred: 0,
    canceled: 0,
  };
}

function emptyRollup(): TaskRollup {
  return {
    total: 0,
    done: 0,
    counts: emptyCounts(),
    ready: 0,
    blocked: 0,
    progress: 0,
    days: 0,
    points: 0,
    remainingDays: 0,
    remainingPoints: 0,
  };
}

function indentWidth(line: string): number {
  let width = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === ' ') width += 1;
    // Mixed tabs and spaces are common in a hand-edited plan; expanding the tab
    // the way an editor draws it keeps the nesting the author saw.
    else if (character === '\t') width += TAB_WIDTH - (width % TAB_WIDTH);
    else break;
  }
  return width;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const folded = value.toLowerCase();
    if (seen.has(folded)) continue;
    seen.add(folded);
    result.push(value);
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * One line
 * ------------------------------------------------------------------ */

/** `- `, `* ` or `+ ` followed by the rest of the line. */
const BULLET = /^([-*+])[ \t]+(.*)$/;
/** A checkbox at the head of a bullet's content. */
const CHECKBOX = /^\[([^\]]?)\][ \t]*(.*)$/;
/** A trailing markdown link, taken off before anything looks for a `#label`. */
const TRAILING_LINK = /\[([^\][]*)\]\(([^()\s]*)\)[ \t]*$/;
/** An id is a single token ending in a colon, at the head of the title. */
const LEADING_ID = /^([A-Za-z0-9][A-Za-z0-9._/-]*):(?:[ \t]+|$)/;

/**
 * Every token that could start a field.
 *
 * `(^|\s)` keeps `you@example.com` and `C#` out of it: a sigil only counts at
 * the start of a word. A `key:` match still has to name a known field, and a
 * `!word` still has to name a priority, or the scan leaves it in the title.
 */
const FIELD_TOKEN =
  /(?:^|[ \t])(?:(@[^\s]+)|(#[A-Za-z0-9_][A-Za-z0-9_/-]*)|!([A-Za-z][A-Za-z0-9]*)|([A-Za-z]+)[ \t]*:)/g;

interface FieldSpan {
  start: number;
  end: number;
  kind: 'assignee' | 'label' | 'priority' | 'key';
  key?: FieldKey;
  raw: string;
}

function trimSigil(token: string): string {
  return token.slice(1).replace(/[.,;:]+$/, '');
}

function parseEstimate(raw: string): TaskEstimate | undefined {
  const text = raw.trim();
  const match = /^(\d+(?:\.\d+)?)\s*([A-Za-z]*)$/.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  const suffix = match[2].toLowerCase();

  if (suffix === '' || suffix === 'pt' || suffix === 'pts' || suffix === 'point' || suffix === 'points') {
    return { value, unit: 'pt', days: 0, points: value, text };
  }
  if (suffix === 'h' || suffix === 'hr' || suffix === 'hrs' || suffix === 'hour' || suffix === 'hours') {
    return { value, unit: 'h', days: value / HOURS_PER_DAY, points: 0, text };
  }
  if (suffix === 'd' || suffix === 'day' || suffix === 'days') {
    return { value, unit: 'd', days: value, points: 0, text };
  }
  if (suffix === 'w' || suffix === 'wk' || suffix === 'week' || suffix === 'weeks') {
    return { value, unit: 'w', days: value * DAYS_PER_WEEK, points: 0, text };
  }
  // A unit this format does not define is not an estimate. Leaving it undefined
  // keeps the rollup honest rather than counting `est: 3 sprints` as 3 points.
  return undefined;
}

/**
 * Splits the text after the checkbox into fields and the title that is left.
 *
 * Values run to the next field token, except `trigger:` and `reason:`, which
 * are prose and run to the end of the line.
 */
function parseFields(text: string): { fields: TaskFields; title: string } {
  const fields = emptyFields();
  const spans: FieldSpan[] = [];

  FIELD_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FIELD_TOKEN.exec(text)) !== null) {
    const [assignee, label, priority, key] = [match[1], match[2], match[3], match[4]];
    const token = assignee ?? label ?? (priority !== undefined ? `!${priority}` : undefined) ?? match[0].trimStart();
    const start = match.index + match[0].length - (token ? token.length : 0);

    if (assignee) {
      spans.push({ start, end: start + assignee.length, kind: 'assignee', raw: assignee });
      continue;
    }
    if (label) {
      spans.push({ start, end: start + label.length, kind: 'label', raw: label });
      continue;
    }
    if (priority !== undefined) {
      // A `!word` that is not a priority is ordinary emphasis; leave it alone.
      if (PRIORITY_BY_WORD[priority.toLowerCase()] === undefined) continue;
      spans.push({ start, end: start + priority.length + 1, kind: 'priority', raw: priority.toLowerCase() });
      continue;
    }
    if (key) {
      const folded = key.toLowerCase() as FieldKey;
      if (!(FIELD_KEYS as readonly string[]).includes(folded)) continue;
      spans.push({ start, end: match.index + match[0].length, kind: 'key', key: folded, raw: '' });
    }
  }

  spans.sort((left, right) => left.start - right.start);

  // A key field's value ends where the next field begins - or at the end of the
  // line, for the two that are free text.
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (span.kind !== 'key' || !span.key) continue;
    const stop = FREE_TEXT_KEYS.has(span.key)
      ? text.length
      : (spans[index + 1]?.start ?? text.length);
    span.raw = text.slice(span.end, stop).trim();
    span.end = stop;
    if (FREE_TEXT_KEYS.has(span.key)) {
      // Everything after a free-text key belongs to it, so nothing later counts.
      spans.length = index + 1;
      break;
    }
  }

  for (const span of spans) {
    if (span.kind === 'assignee') {
      const name = trimSigil(span.raw);
      if (name) fields.assignees.push(name);
    } else if (span.kind === 'label') {
      const name = trimSigil(span.raw);
      if (name) fields.labels.push(name);
    } else if (span.kind === 'priority') {
      fields.priority = PRIORITY_BY_WORD[span.raw];
    } else if (span.key === 'needs') {
      span.raw
        .split(/[,\s]+/)
        .map((value) => value.replace(/[.;]+$/, '').trim())
        .filter(Boolean)
        .forEach((value) => fields.needs.push(value));
    } else if (span.key === 'est') {
      fields.estimate = parseEstimate(span.raw) ?? fields.estimate;
    } else if (span.key === 'due') {
      if (span.raw) fields.due = span.raw;
    } else if (span.key === 'milestone') {
      if (span.raw) fields.milestone = span.raw;
    } else if (span.key === 'trigger') {
      if (span.raw) fields.trigger = span.raw;
    } else if (span.key === 'reason') {
      if (span.raw) fields.reason = span.raw;
    }
  }

  fields.assignees = unique(fields.assignees);
  fields.labels = unique(fields.labels);
  fields.needs = unique(fields.needs);

  let title = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    title += text.slice(cursor, span.start) + ' ';
    cursor = span.end;
  }
  title += text.slice(cursor);

  return { fields, title: title.replace(/\s+/g, ' ').trim() };
}

interface ParsedTaskLine {
  status: TaskStatus;
  id?: string;
  title: string;
  link?: TaskLink;
  fields: TaskFields;
}

/**
 * Reads one bullet. Returns `null` when the line is not a task, which is the
 * only signal the caller needs to keep it as a plain line.
 */
function parseTaskLine(body: string): ParsedTaskLine | null {
  const bullet = BULLET.exec(body);
  if (!bullet) return null;

  const checkbox = CHECKBOX.exec(bullet[2]);
  if (!checkbox) return null;

  const marker = checkbox[1];
  // `[]` and `[ ]` are the same empty box. Any other content is a marker this
  // format does not define, and guessing at it is what mangles a plan.
  const status = marker.trim() === '' ? 'todo' : STATUS_BY_MARKER[marker];
  if (!status) return null;

  let rest = checkbox[2];

  // Before the tag scan, so `[spec](doc.mdx#ids)` does not leave a `#ids` label.
  let link: TaskLink | undefined;
  const linkMatch = TRAILING_LINK.exec(rest);
  if (linkMatch) {
    const href = linkMatch[2];
    link = { text: linkMatch[1] || href, href: safeHref(href) };
    rest = rest.slice(0, linkMatch.index);
  }

  const { fields, title: withId } = parseFields(rest);

  // After the fields, so a line that is only `needs: A` has no title to take an
  // id from, and before anything else, so `AG-1:` is not part of the title.
  let id: string | undefined;
  let title = withId;
  const idMatch = LEADING_ID.exec(withId);
  if (idMatch) {
    id = idMatch[1];
    title = withId.slice(idMatch[0].length).trim();
  }

  return { status, id, title, link, fields };
}

/* ------------------------------------------------------------------ *
 * The document
 * ------------------------------------------------------------------ */

interface OpenNode {
  node: TaskNode;
  /** Paragraphs collected so far, each one a list of lines. */
  paragraphs: string[][];
}

function parseLines(source: string): { items: TaskItem[]; tasks: TaskNode[]; byKey: Map<string, TaskItem> } {
  const lines = source.split(/\r\n|\r|\n/);
  const items: TaskItem[] = [];
  const tasks: TaskNode[] = [];
  const byKey = new Map<string, TaskItem>();
  const stack: OpenNode[] = [];
  /** The node the last description line went to, and whether a blank followed. */
  let lastDescriptionTarget: OpenNode | null = null;
  let blankSeen = false;

  const attach = (item: TaskItem, parent: TaskNode | undefined) => {
    if (parent) {
      item.parentKey = parent.key;
      parent.children.push(item);
    } else {
      items.push(item);
    }
    byKey.set(item.key, item);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const indent = indentWidth(raw);
    const body = raw.slice(raw.length - raw.trimStart().length);

    if (body.trim() === '') {
      blankSeen = true;
      continue;
    }

    const parsed = parseTaskLine(body);
    const key = `L${index}`;

    if (parsed) {
      // A bullet at or left of an open node's own indentation is its sibling or
      // its uncle, never its child.
      while (stack.length > 0 && indent <= stack[stack.length - 1].node.indent) stack.pop();
      const parent = stack[stack.length - 1]?.node;

      const node: TaskNode = {
        kind: 'task',
        key,
        line: index,
        source: raw,
        indent,
        depth: stack.length,
        status: parsed.status,
        id: parsed.id,
        title: parsed.title,
        link: parsed.link,
        own: parsed.fields,
        fields: emptyFields(),
        description: [],
        children: [],
        rootKey: stack.length > 0 ? stack[0].node.key : key,
        path: stack.map((entry) => entry.node.title),
        unmetNeeds: [],
        blocked: parsed.status === 'blocked',
        ready: false,
        inconsistent: false,
        rollup: emptyRollup(),
      };

      attach(node, parent);
      tasks.push(node);
      stack.push({ node, paragraphs: [] });
      lastDescriptionTarget = null;
      blankSeen = false;
      continue;
    }

    const isBullet = BULLET.test(body);
    // Prose belongs to the deepest open node it is indented past. The stack is
    // left alone: a bullet deeper than this line still nests where it would
    // have without the prose in between.
    const target = isBullet
      ? undefined
      : [...stack].reverse().find((entry) => indent > entry.node.indent);

    if (target) {
      if (target !== lastDescriptionTarget || blankSeen || target.paragraphs.length === 0) {
        target.paragraphs.push([]);
      }
      target.paragraphs[target.paragraphs.length - 1].push(body.trim());
      // Soft line breaks join into one paragraph, as markdown reads them.
      target.node.description = target.paragraphs.map((paragraph) => paragraph.join(' '));
      lastDescriptionTarget = target;
      blankSeen = false;
      continue;
    }

    // Everything else - an unrecognised marker, a bullet with no checkbox,
    // prose that is not indented under anything - stays exactly where it is.
    const parentEntry = [...stack].reverse().find((entry) => indent > entry.node.indent);
    const line: TaskPlainLine = {
      kind: 'line',
      key,
      line: index,
      source: raw,
      text: body,
      indent,
      depth: parentEntry ? parentEntry.node.depth + 1 : 0,
    };
    attach(line, parentEntry?.node);
    lastDescriptionTarget = null;
    blankSeen = false;
  }

  return { items, tasks, byKey };
}

/**
 * Pushes `@assignee`, `#label` and `milestone:` down the tree.
 *
 * Applied in document order, where a parent is always already resolved, so no
 * pass in this file recurses - a plan nested a thousand levels deep by accident
 * has to degrade, not overflow the stack.
 */
function inherit(node: TaskNode, parent: TaskFields | null): void {
  node.fields = {
    // Declaring any of the three replaces what came down, rather than adding to
    // it: "unless overridden" is the whole contract, and a merged label set
    // could never be narrowed by a child.
    assignees: node.own.assignees.length > 0 ? node.own.assignees : (parent?.assignees ?? []),
    labels: node.own.labels.length > 0 ? node.own.labels : (parent?.labels ?? []),
    milestone: node.own.milestone ?? parent?.milestone,
    // Status and dependencies are statements about this line only.
    needs: node.own.needs,
    estimate: node.own.estimate,
    due: node.own.due,
    trigger: node.own.trigger,
    reason: node.own.reason,
    priority: node.own.priority,
  };
}

function taskChildren(node: TaskNode): TaskNode[] {
  return node.children.filter((child): child is TaskNode => child.kind === 'task');
}

/** Folds one already-rolled child into a running total. */
function absorb(rollup: TaskRollup, child: TaskNode): void {
  const inner = child.rollup;
  rollup.total += 1 + inner.total;
  rollup.done += (child.status === 'done' ? 1 : 0) + inner.done;
  rollup.counts[child.status] += 1;
  for (const status of TASK_STATUSES) rollup.counts[status] += inner.counts[status];
  rollup.ready += (child.ready ? 1 : 0) + inner.ready;
  rollup.blocked += (child.blocked ? 1 : 0) + inner.blocked;
  rollup.days += inner.days;
  rollup.points += inner.points;
  rollup.remainingDays += inner.remainingDays;
  rollup.remainingPoints += inner.remainingPoints;
}

function settle(rollup: TaskRollup): void {
  // Canceled work is out of scope, so it neither counts as done nor holds the
  // bar back. Deferred work is still planned and still counts.
  const divisor = rollup.total - rollup.counts.canceled;
  rollup.progress = divisor > 0 ? rollup.done / divisor : 0;
}

/**
 * One node's totals, from its direct children's.
 *
 * The caller walks the flat task list backwards, which in a pre-order list
 * means every descendant is finished before its parent is reached - the same
 * result as recursing, without the stack.
 */
function roll(node: TaskNode): void {
  const rollup = emptyRollup();
  const own = node.fields.estimate;
  // The subtree total includes this node's own estimate. An estimate on a
  // parent *and* on its children therefore counts twice, which is why the
  // format's advice is to estimate leaves.
  rollup.days = own?.days ?? 0;
  rollup.points = own?.points ?? 0;
  if (node.status !== 'done') {
    rollup.remainingDays = rollup.days;
    rollup.remainingPoints = rollup.points;
  }

  for (const child of taskChildren(node)) absorb(rollup, child);
  settle(rollup);
  node.rollup = rollup;

  // A parent's own marker is authored and may legitimately disagree with its
  // children. Both are kept; the row says so.
  node.inconsistent =
    node.status === 'done' &&
    rollup.total > 0 &&
    rollup.counts.todo + rollup.counts['in-progress'] + rollup.counts.blocked + rollup.counts.deferred >
      0;
}

/**
 * Parses a `tasks` fence. Never throws: anything it cannot read comes back as a
 * plain line in the position it was written.
 */
export function parseTaskBoard(source: unknown): TaskDocument {
  const empty: TaskDocument = {
    items: [],
    tasks: [],
    byId: new Map(),
    byKey: new Map(),
    assignees: [],
    labels: [],
    milestones: [],
    epics: [],
    totals: emptyRollup(),
    inconsistencies: [],
  };

  if (typeof source !== 'string' || source.length === 0) return empty;

  try {
    const { items, tasks, byKey } = parseLines(source);

    const byId = new Map<string, TaskNode>();
    for (const task of tasks) {
      // The first line to claim an id keeps it; a duplicate would otherwise
      // silently redirect everything that depends on the original.
      if (task.id && !byId.has(task.id.toLowerCase())) byId.set(task.id.toLowerCase(), task);
    }

    // Document order: a parent is always resolved before its children.
    for (const task of tasks) {
      const parent = task.parentKey ? byKey.get(task.parentKey) : undefined;
      inherit(task, parent && parent.kind === 'task' ? parent.fields : null);
    }

    for (const task of tasks) {
      // A dependency the document does not contain is somebody else's problem
      // and counts as satisfied - a plan that only describes part of the work
      // would otherwise show every entry point as blocked.
      task.unmetNeeds = task.fields.needs.filter((need) => {
        const target = byId.get(need.toLowerCase());
        return Boolean(target) && target!.status !== 'done';
      });
      task.blocked = task.status === 'blocked' || task.unmetNeeds.length > 0;
      task.ready = task.status === 'todo' && task.unmetNeeds.length === 0;
    }

    // Backwards through a pre-order list is post-order: children first.
    for (let index = tasks.length - 1; index >= 0; index -= 1) roll(tasks[index]);

    const totals = emptyRollup();
    for (const item of items) {
      if (item.kind === 'task') absorb(totals, item);
    }
    settle(totals);

    const collator = (left: string, right: string) => left.localeCompare(right);

    return {
      items,
      tasks,
      byId,
      byKey,
      assignees: unique(tasks.flatMap((task) => task.fields.assignees)).sort(collator),
      labels: unique(tasks.flatMap((task) => task.fields.labels)).sort(collator),
      milestones: unique(
        tasks.map((task) => task.fields.milestone).filter((value): value is string => Boolean(value))
      ).sort(collator),
      epics: items.filter(
        (item): item is TaskNode =>
          item.kind === 'task' && item.children.some((child) => child.kind === 'task')
      ),
      totals,
      inconsistencies: tasks.filter((task) => task.inconsistent),
    };
  } catch {
    // Unreachable by design. If it is ever reached, an empty board is a far
    // better outcome than an error banner where the plan should be.
    return empty;
  }
}

/** Every task in `items`, in document order. */
export function flattenTasks(items: TaskItem[]): TaskNode[] {
  const result: TaskNode[] = [];
  const pending: TaskItem[] = items.slice().reverse();
  while (pending.length > 0) {
    const item = pending.pop() as TaskItem;
    if (item.kind !== 'task') continue;
    result.push(item);
    for (let index = item.children.length - 1; index >= 0; index -= 1) pending.push(item.children[index]);
  }
  return result;
}

/** Formats a rollup's two dimensions for display, e.g. `4d · 8 pts`. */
export function formatEstimate(days: number, points: number): string {
  const parts: string[] = [];
  if (days > 0) parts.push(`${Number(days.toFixed(2))}d`);
  if (points > 0) parts.push(`${Number(points.toFixed(2))} pts`);
  return parts.join(' · ');
}

/**
 * The status a tick would move a node to.
 *
 * Only used to fill in `onToggleStatus`; the component never applies it itself.
 */
export function nextStatus(status: TaskStatus): TaskStatus {
  if (status === 'todo') return 'in-progress';
  if (status === 'in-progress') return 'done';
  if (status === 'done') return 'todo';
  return 'todo';
}

/** Work left inside a node: everything under it that is not done or canceled. */
export function openInside(node: TaskNode): number {
  const counts = node.rollup.counts;
  return counts.todo + counts['in-progress'] + counts.blocked + counts.deferred;
}

/**
 * Whether ticking this node to done would be telling the truth.
 *
 * A parent is done when the work inside it is done. The board never rewrites a
 * marker an author typed - a `[x]` over open children stays exactly as written
 * and is reported on the row - but it will not *offer* to create one: the tick
 * that a host wires up cycles a parent between to-do and in progress until the
 * items underneath it are finished.
 */
export function canComplete(node: TaskNode): boolean {
  return openInside(node) === 0;
}

/** {@link nextStatus}, with that rule applied. */
export function nextStatusFor(node: TaskNode): TaskStatus {
  const next = nextStatus(node.status);
  return next === 'done' && !canComplete(node) ? 'todo' : next;
}
