/**
 * `<TaskBoard>` - a plan checklist, read from a ```` ```tasks ```` fence.
 *
 * Three decisions run through the whole file.
 *
 * **It holds no document state.** Nothing here ticks a box, moves a line or
 * remembers anything about the plan. The file is the plan. What the component
 * keeps is view state - which filters are on, which rows are open - and even
 * that is thrown away when the document changes. A host that wants a tick to
 * mean something passes `onToggleStatus` / `onMove`; without them the controls
 * are not rendered at all, because a control that appears to change the plan
 * and does not is worse than no control.
 *
 * **Two disclosures per row, and they do not drive each other.** A row's prose
 * and a row's children open independently. Collapsing a parent must not hide a
 * description the reader just opened, and reading a description must not
 * unfold sixty children underneath it.
 *
 * **The export pass strips every `button`.** So in `renderMode === 'pdf'` this
 * renders no buttons at all and everything is already open: descriptions,
 * children, the completed bucket. What the reader sees on paper is the whole
 * plan, not the parts that happened to be expanded.
 */
import React, { useCallback, useContext, useMemo, useState } from 'react';
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUp,
  ChevronsUpDown,
  Circle,
  CircleDot,
  Copy,
  Flame,
  Link2,
  ListChecks,
  Milestone,
  OctagonAlert,
} from 'lucide-react';
import { MdxRenderContext } from '@mdxstudio/core';

import { InlineMarkdown } from './inlineMarkdown';
import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  canComplete,
  flattenTasks,
  nextStatusFor,
  openInside,
  parseTaskBoard,
  type TaskDocument,
  type TaskItem,
  type TaskNode,
  type TaskStatus,
} from './parseTasks';

/* ------------------------------------------------------------------ *
 * Public shape
 * ------------------------------------------------------------------ */

export type TaskView = 'list' | 'board';

export type TaskGroupBy =
  | 'none'
  | 'parent'
  | 'status'
  | 'assignee'
  | 'label'
  | 'milestone'
  | 'priority';

/** Where a move would put a node. Interpreting it is the host's job. */
export interface TaskMove {
  direction: 'up' | 'down' | 'in' | 'out';
}

export interface TaskBoardProps {
  /** The plan. A `tasks` fence arrives as children instead. */
  source?: string;
  children?: React.ReactNode;
  /** Set by the fence renderer. Present so it is not spread onto the DOM. */
  language?: string;
  title?: string;
  className?: string;
  /** The view the board opens in. */
  defaultView?: TaskView;
  /** The grouping the board opens with. */
  defaultGroupBy?: TaskGroupBy;
  /**
   * How many top-level items the list shows before "View more". Work in flight
   * is always shown, however far down the plan it is. `0` shows everything.
   */
  initialItems?: number;
  /**
   * Called when the reader ticks a row. Supplying it is what makes the status
   * marker a control; the component still changes nothing itself.
   *
   * The VS Code extension wires this to a `WorkspaceEdit`, so a tick goes
   * through the editor's undo stack and its dirty buffer like any other edit.
   */
  onToggleStatus?: (node: TaskNode, next: TaskStatus) => void;
  /** Called when the reader moves a row. Same contract as `onToggleStatus`. */
  onMove?: (node: TaskNode, next: TaskMove) => void;
}

/* ------------------------------------------------------------------ *
 * Reading the source out of props
 * ------------------------------------------------------------------ */

function childrenToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  // A fence hands over a string; a hand-written `<TaskBoard>` in MDX can hand
  // over an element whose own children are the text.
  const element = children as { props?: { children?: React.ReactNode } } | null;
  if (element && typeof element === 'object' && element.props) {
    return childrenToText(element.props.children);
  }
  return '';
}

function readSource(props: TaskBoardProps): string {
  if (typeof props.source === 'string') return props.source;
  return childrenToText(props.children);
}

/* ------------------------------------------------------------------ *
 * Status presentation
 * ------------------------------------------------------------------ */

const STATUS_ICON: Record<TaskStatus, React.ComponentType<{ className?: string }>> = {
  todo: Circle,
  'in-progress': CircleDot,
  done: CheckCircle2,
  blocked: OctagonAlert,
  deferred: ArrowRight,
  canceled: Ban,
};

/** Statuses that belong in the completed bucket at the bottom of a board. */
const CLOSED: TaskStatus[] = ['done', 'canceled'];

function StatusGlyph({ status }: { status: TaskStatus }) {
  const Icon = STATUS_ICON[status];
  return <Icon className="mdxstudio-tasks__icon-14" />;
}

/* ------------------------------------------------------------------ *
 * View state
 * ------------------------------------------------------------------ */

interface Disclosure {
  /** The document this state belongs to; a new one resets everything. */
  document: TaskDocument;
  children: Set<string>;
  descriptions: Set<string>;
  /** Board columns and grouped sections the reader has folded away. */
  groups: Set<string>;
  /**
   * The filter these open rows were last seeded for.
   *
   * A filter opens the way down to what it matched - once, when it changes.
   * It does not *hold* those rows open: a reader who then collapses one has
   * collapsed it, and a control that springs back is not a control.
   */
  filterKey: string;
}

/**
 * What is open on first render.
 *
 * Everything is closed except the path down to work in progress: a sixty-node
 * plan opened flat is a wall of text with no overview, and the one thing a
 * reader always wants to see is where the work currently is.
 */
function initialDisclosure(document: TaskDocument): Disclosure {
  const open = new Set<string>();
  for (const task of document.tasks) {
    if (task.status !== 'in-progress') continue;
    let parentKey = task.parentKey;
    while (parentKey) {
      if (open.has(parentKey)) break;
      open.add(parentKey);
      const parent = document.byKey.get(parentKey);
      parentKey = parent?.parentKey;
    }
  }
  return {
    document,
    children: open,
    descriptions: new Set(),
    // Settled work starts folded, wherever it is shown. It is there to be
    // checked, not to be scrolled past.
    groups: new Set([CLOSED_BUCKET, DEFERRED_BUCKET]),
    filterKey: '',
  };
}

/**
 * Everything on the way down to a match, so a filter never hides its own hits.
 *
 * That includes the settled buckets: a filter that matched three finished items
 * and then showed an empty board would be lying about the plan.
 */
function seedForFilters(
  open: Set<string>,
  groups: Set<string>,
  document: TaskDocument,
  filters: Filters
): { children: Set<string>; groups: Set<string> } {
  const children = new Set(open);
  const openGroups = new Set(groups);
  for (const task of document.tasks) {
    if (!matchesFilters(task, filters)) continue;
    const root = document.byKey.get(task.rootKey);
    const bucket = root ? bucketFor(root) : null;
    if (bucket) openGroups.delete(bucket);
    let parentKey = task.parentKey;
    while (parentKey && !children.has(parentKey)) {
      children.add(parentKey);
      parentKey = document.byKey.get(parentKey)?.parentKey;
    }
  }
  return { children, groups: openGroups };
}

function toggle(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

interface Filters {
  assignee: string;
  label: string;
  milestone: string;
  /** A top-level node's key: everything outside its subtree is hidden. */
  epic: string;
  text: string;
}

const NO_FILTERS: Filters = {
  assignee: '',
  label: '',
  milestone: '',
  epic: '',
  text: '',
};

function filtersActive(filters: Filters): boolean {
  return (
    Boolean(filters.assignee) ||
    Boolean(filters.label) ||
    Boolean(filters.milestone) ||
    Boolean(filters.epic) ||
    Boolean(filters.text.trim())
  );
}

function haystack(node: TaskNode): string {
  return [node.id ?? '', node.title, node.description.join(' '), node.fields.trigger ?? '', node.fields.reason ?? '']
    .join(' ')
    .toLowerCase();
}

function matchesFilters(node: TaskNode, filters: Filters): boolean {
  // The epic is a scope rather than a property: an item matches when it is the
  // epic itself or hangs off it.
  if (filters.epic && node.rootKey !== filters.epic) return false;
  if (filters.assignee && !node.fields.assignees.includes(filters.assignee)) return false;
  if (filters.label && !node.fields.labels.includes(filters.label)) return false;
  if (filters.milestone && node.fields.milestone !== filters.milestone) return false;
  const text = filters.text.trim().toLowerCase();
  if (text && !haystack(node).includes(text)) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

interface Row {
  item: TaskItem;
  depth: number;
  /** Only for tasks: whether this row's children are showing. */
  open: boolean;
  /** Only for tasks: whether the row has children to show at all. */
  hasChildren: boolean;
  /** Shown greyed before the title, so a row lifted out of the tree says where it came from. */
  context?: string[];
}

/** Keys of the two buckets settled work sinks into. */
const CLOSED_BUCKET = '~closed';
const DEFERRED_BUCKET = '~deferred';

/** Top-level items the list shows before the reader asks for the rest. */
const DEFAULT_INITIAL_ITEMS = 6;

/** Whether this item, or anything inside it, is being worked on right now. */
function inFlight(item: TaskItem): boolean {
  if (item.kind !== 'task') return false;
  return item.status === 'in-progress' || item.rollup.counts['in-progress'] > 0;
}

/**
 * The next few items, after the work in flight has been taken off the top.
 *
 * Their order is the order they were written in: an author's sequence is a
 * statement, and re-ranking it by readiness would be this component inventing a
 * priority nobody typed.
 */
function headOfPlan(items: TaskItem[], limit: number): { shown: TaskItem[]; hidden: number } {
  if (limit <= 0 || items.length <= limit) return { shown: items, hidden: 0 };
  return { shown: items.slice(0, limit), hidden: items.length - limit };
}

/**
 * Which bucket an item belongs in, if any. Applies at every level of the tree.
 *
 * Finished work is the thing a reader has to scroll past every time to reach
 * the work that is left, so it sinks - but only when there is nothing live
 * underneath it. A done parent over open children is an inconsistency the board
 * is meant to *show*, and a fold at the bottom is the one place it must not go.
 */
function bucketFor(item: TaskItem): string | null {
  if (item.kind !== 'task') return null;
  const counts = item.rollup.counts;
  if (item.status === 'done' || item.status === 'canceled') {
    const live = counts.todo + counts['in-progress'] + counts.blocked + counts.deferred;
    return live === 0 ? CLOSED_BUCKET : null;
  }
  if (item.status === 'deferred') {
    // Todo work under a deferred item is exactly what deferral means; work in
    // flight under it is not, and keeps it in the list.
    return counts['in-progress'] + counts.blocked === 0 ? DEFERRED_BUCKET : null;
  }
  return null;
}

/**
 * The rows the list view draws, flat and in document order.
 *
 * Flat rather than nested: it is the same tree either way, and a flat list is
 * what "copy every visible line, in document order" needs to be trivially
 * correct.
 */
function buildRows(
  document: TaskDocument,
  disclosure: Disclosure,
  filters: Filters,
  forceOpen: boolean,
  items: TaskItem[] = document.items,
  hideSettled = true
): Row[] {
  const active = filtersActive(filters);
  const keep = new Set<string>();

  if (active) {
    for (const task of document.tasks) {
      if (!matchesFilters(task, filters)) continue;
      keep.add(task.key);
      let parentKey = task.parentKey;
      while (parentKey && !keep.has(parentKey)) {
        keep.add(parentKey);
        parentKey = document.byKey.get(parentKey)?.parentKey;
      }
    }
  }

  const rows: Row[] = [];
  const walk = (list: TaskItem[], depth: number, context?: string[]) => {
    for (const item of list) {
      if (item.kind === 'line') {
        // A malformed line keeps its place. Under a filter it goes with its
        // parent, because on its own there is nothing to match it against.
        if (!active) rows.push({ item, depth, open: false, hasChildren: false });
        continue;
      }
      // In the live list, settled work has already been lifted into a bucket;
      // in a bucket, `hideSettled` is off and everything inside is drawn.
      if (hideSettled && bucketFor(item)) continue;
      if (active && !keep.has(item.key)) continue;

      const children = hideSettled
        ? item.children.filter((child) => !bucketFor(child))
        : item.children;
      const hasChildren = children.length > 0;
      // Whether a row is open is the reader's business under a filter too; the
      // filter only *seeds* what is open, in `seedForFilters`.
      const open = hasChildren && (forceOpen || disclosure.children.has(item.key));
      rows.push({ item, depth, open, hasChildren, context: depth === 0 ? context : undefined });
      if (open) walk(children, depth + 1);
    }
  };

  if (hideSettled) walk(items, 0);
  // A bucket's entries were lifted out of the tree, so each one carries the
  // path it came from.
  else for (const item of items) walk([item], 0, item.kind === 'task' ? item.path : undefined);

  return rows;
}

/* ------------------------------------------------------------------ *
 * Grouping
 * ------------------------------------------------------------------ */

interface Group {
  key: string;
  label: string;
  nodes: TaskNode[];
}

function groupKeys(node: TaskNode, groupBy: TaskGroupBy, document: TaskDocument): [string, string] {
  if (groupBy === 'status') return [node.status, TASK_STATUS_LABELS[node.status]];
  if (groupBy === 'assignee') {
    const name = node.fields.assignees[0];
    return name ? [`@${name}`, `@${name}`] : ['~none', 'Unassigned'];
  }
  if (groupBy === 'label') {
    const name = node.fields.labels[0];
    return name ? [`#${name}`, `#${name}`] : ['~none', 'No label'];
  }
  if (groupBy === 'milestone') {
    const name = node.fields.milestone;
    return name ? [name, name] : ['~none', 'No milestone'];
  }
  if (groupBy === 'priority') {
    const value = node.fields.priority;
    return value ? [`p${value}`, TASK_PRIORITY_LABELS[value]] : ['~none', 'No priority'];
  }
  if (groupBy === 'parent') {
    const parent = node.parentKey ? document.byKey.get(node.parentKey) : undefined;
    if (parent && parent.kind === 'task') return [parent.key, parent.title || parent.id || 'Untitled'];
    return ['~top', 'Top level'];
  }
  return ['~all', 'All work'];
}

/**
 * Buckets the closed work at the end.
 *
 * Done and canceled share one bucket because neither is work anybody is going
 * to pick up; deferred keeps its own, because it is work somebody deliberately
 * put down and will come back to. Grouping by status is the exception - there
 * the buckets are the groups.
 */
function buildGroups(nodes: TaskNode[], groupBy: TaskGroupBy, document: TaskDocument): Group[] {
  const separate = groupBy !== 'status';
  const groups: Group[] = [];
  const byKey = new Map<string, Group>();

  const closed: Group = { key: '~closed', label: 'Completed and canceled', nodes: [] };
  const deferred: Group = { key: '~deferred', label: 'Deferred', nodes: [] };

  for (const node of nodes) {
    if (separate && CLOSED.includes(node.status)) {
      closed.nodes.push(node);
      continue;
    }
    if (separate && node.status === 'deferred') {
      deferred.nodes.push(node);
      continue;
    }
    const [key, label] = groupKeys(node, groupBy, document);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label, nodes: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.nodes.push(node);
  }

  if (deferred.nodes.length > 0) groups.push(deferred);
  if (closed.nodes.length > 0) groups.push(closed);
  return groups;
}

/* ------------------------------------------------------------------ *
 * Clipboard
 * ------------------------------------------------------------------ */

/** Copies text, through whichever path this browser allows, and never throws. */
function copyText(text: string): void {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clipboard && typeof clipboard.writeText === 'function') {
      void clipboard.writeText(text).catch(() => undefined);
      return;
    }
    // A webview without clipboard permission still has this one.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  } catch {
    // Losing a copy is a disappointment. Throwing here would lose the document.
  }
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

/**
 * One field, drawn as itself.
 *
 * Every chip used to be the same grey pill, which made a row of them a wall to
 * be read word by word. Each kind now has its own glyph and its own tone, so a
 * row is scannable at a glance - who, what kind of work, how long, what it is
 * waiting for - without reading a single label. The tones are the ones
 * `@mdxstudio/react` already uses for `Badge`, so a plan looks like the rest of
 * the document rather than like a second design.
 */
function Chip({
  tone,
  icon: Icon,
  mono,
  title,
  children,
}: {
  tone: 'who' | 'label' | 'milestone' | 'time' | 'due' | 'needs' | 'unmet' | 'ready' | 'urgent' | 'high' | 'low';
  icon?: React.ComponentType<{ className?: string }>;
  mono?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`mdxstudio-tasks__chip mdxstudio-tasks__chip--${tone}${
        mono ? ' mdxstudio-tasks__chip--mono' : ''
      }`}
      title={title}
    >
      {Icon && <Icon className="mdxstudio-tasks__icon-10" />}
      {children}
    </span>
  );
}

const PRIORITY_TONE: Record<number, 'urgent' | 'high' | 'low'> = {
  1: 'urgent',
  2: 'high',
  3: 'low',
  4: 'low',
};

/**
 * The fields of one row, each in its own place.
 *
 * The slots are always in the same order and always the same width, so the same
 * kind of fact sits in the same column on every row and the eye can run down
 * one column - who owns this, what is it waiting for - instead of reading every
 * row left to right. An empty slot still holds its column: a gap where the
 * assignee would be is itself information.
 *
 * Below the width where six columns fit, the rail collapses back into a wrapped
 * line, because on a narrow preview pane a rigid grid would truncate every
 * value it holds. That is a container query, not a screen query: what matters
 * is how wide the board is, not how wide the display is.
 */
function MetaRail({ node, wrap }: { node: TaskNode; wrap?: boolean }) {
  const fields = node.fields;

  // Estimates are parsed and available through `parseTaskBoard`, but the board
  // does not draw them: a column of durations is a forecast nobody asked this
  // to make.

  return (
    <span className={`mdxstudio-tasks__meta${wrap ? ' mdxstudio-tasks__meta--wrap' : ''}`}>
      <span className="mdxstudio-tasks__slot mdxstudio-tasks__slot--needs">
        {/* Only what is actually holding the work up. A satisfied dependency is
            history, and history does not belong on every row. */}
        {node.unmetNeeds.length > 0 && (
          <Chip tone="unmet" icon={Link2} mono title={`Waiting on ${node.unmetNeeds.join(', ')}`}>
            {node.unmetNeeds.join(', ')}
          </Chip>
        )}
      </span>

      <span className="mdxstudio-tasks__slot mdxstudio-tasks__slot--when">
        {fields.milestone && (
          <Chip tone="milestone" icon={Milestone} title={`Milestone ${fields.milestone}`}>
            {fields.milestone}
          </Chip>
        )}
        {fields.due && (
          <span className="mdxstudio-tasks__when" title={`Due ${fields.due}`}>
            {fields.due}
          </span>
        )}
      </span>

      <span
        className="mdxstudio-tasks__slot mdxstudio-tasks__slot--labels"
        title={fields.labels.length > 0 ? fields.labels.map((name) => `#${name}`).join(' ') : undefined}
      >
        {/* Three at most. A fourth label on a row is a taxonomy problem, and
            the rest are one hover away in the slot's own tooltip. */}
        {fields.labels.slice(0, 3).map((name) => (
          <span key={`l-${name}`} className="mdxstudio-tasks__label">
            <span className="mdxstudio-tasks__dot" data-label-tone={toneOf(name)} aria-hidden="true" />
            <span className="mdxstudio-tasks__label-text">{name}</span>
          </span>
        ))}
        {fields.labels.length > 3 && (
          <span className="mdxstudio-tasks__label-more">+{fields.labels.length - 3}</span>
        )}
      </span>

      <span className="mdxstudio-tasks__slot mdxstudio-tasks__slot--who">
        {/* The initial is the whole chip: a name repeated down a column is a
            column of noise, and the name is one hover away. */}
        {fields.assignees.map((name) => (
          <span key={`a-${name}`} className="mdxstudio-tasks__avatar" title={`Assigned to ${name}`}>
            {name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Five muted hues, picked from the label's own name so it stays put. */
function toneOf(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) % 997;
  return hash % 5;
}

/** What belongs beside the title itself: only a priority worth interrupting for. */
function TitleMarks({ node }: { node: TaskNode }) {
  const priority = node.fields.priority;
  // P3 and P4 are what everything is by default. Drawing them says nothing.
  if (priority !== 1 && priority !== 2) return null;

  return (
    <Chip
      tone={PRIORITY_TONE[priority]}
      icon={priority === 1 ? Flame : ChevronsUp}
      title={`Priority ${TASK_PRIORITY_LABELS[priority]}`}
    >
      {TASK_PRIORITY_LABELS[priority]}
    </Chip>
  );
}

/**
 * A parent's rollup, compact enough to sit on the title's own line.
 *
 * It used to be a block underneath, which made every parent row taller than
 * every leaf row and left the list looking ragged at each level. The words are
 * in the tooltip; the line carries the numbers.
 */
function Summary({ node, open }: { node: TaskNode; open?: boolean }) {
  const rollup = node.rollup;
  if (rollup.total === 0) return null;
  const percent = Math.round(rollup.progress * 100);
  // An open row has its children on screen saying this themselves.
  const counts = !open;

  return (
    <span
      className="mdxstudio-tasks__summary"
      title={`${rollup.done} of ${rollup.total} done${
        rollup.blocked > 0 ? `, ${rollup.blocked} blocked` : ''
      }`}
    >
      {/* A ring, not a bar: it says "how far" in the space of a glyph, and the
          exact count is one hover away rather than one more thing to read. */}
      <svg
        className="mdxstudio-tasks__ring"
        viewBox="0 0 20 20"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <circle className="mdxstudio-tasks__ring-track" cx="10" cy="10" r="8" />
        <circle
          className="mdxstudio-tasks__ring-fill"
          cx="10"
          cy="10"
          r="8"
          strokeDasharray={`${(percent / 100) * 50.27} 50.27`}
        />
      </svg>
      <span className="mdxstudio-tasks__ring-label">
        {rollup.done}/{rollup.total}
      </span>
      {/* What is *blocked* interrupts, because that is the row that needs
          somebody - as a mark and a number, not a sentence. Readiness is not a
          warning and is drawn nowhere: it is derived and available to a host
          through `parseTaskBoard`, and that is where it stays. */}
      {counts && rollup.blocked > 0 && (
        <span
          className="mdxstudio-tasks__summary-text mdxstudio-tasks__summary-text--blocked"
          aria-label={`${rollup.blocked} blocked inside`}
        >
          <OctagonAlert className="mdxstudio-tasks__icon-10" />
          {rollup.blocked}
        </span>
      )}
    </span>
  );
}

function Description({ node }: { node: TaskNode }) {
  return (
    <div className="mdxstudio-tasks__description">
      {node.description.map((paragraph, index) => (
        <p key={index}>
          <InlineMarkdown text={paragraph} />
        </p>
      ))}
      {node.fields.trigger && (
        <p className="mdxstudio-tasks__note">
          <strong>Trigger:</strong> <InlineMarkdown text={node.fields.trigger} />
        </p>
      )}
      {node.fields.reason && (
        <p className="mdxstudio-tasks__note">
          <strong>Reason:</strong> <InlineMarkdown text={node.fields.reason} />
        </p>
      )}
    </div>
  );
}

/** Trigger and reason are prose, so they live with the prose. */
function hasProse(node: TaskNode): boolean {
  return node.description.length > 0 || Boolean(node.fields.trigger) || Boolean(node.fields.reason);
}

/* ------------------------------------------------------------------ *
 * The component
 * ------------------------------------------------------------------ */

export function TaskBoard(props: TaskBoardProps) {
  const context = useContext(MdxRenderContext);
  const isPdf = context.renderMode === 'pdf';

  const source = useMemo(() => readSource(props), [props.source, props.children]);
  const document = useMemo(() => parseTaskBoard(source), [source]);

  const [view, setView] = useState<TaskView>(props.defaultView === 'board' ? 'board' : 'list');
  const [groupBy, setGroupBy] = useState<TaskGroupBy>(props.defaultGroupBy ?? 'none');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [disclosure, setDisclosure] = useState<Disclosure>(() => initialDisclosure(document));

  // A new document is a new plan: its rows are not the rows whose open state
  // this was describing.
  const filterKey = JSON.stringify(filters);
  if (disclosure.document !== document) {
    setDisclosure(initialDisclosure(document));
  } else if (disclosure.filterKey !== filterKey) {
    setDisclosure((current) => ({
      ...current,
      filterKey,
      ...(filtersActive(filters)
        ? seedForFilters(current.children, current.groups, document, filters)
        : {}),
    }));
  }

  const copy = useCallback((key: string, text: string) => {
    copyText(text);
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
  }, []);

  /**
   * The tree, split into what is still live and what has settled.
   *
   * Settled work is collected from every level, not only the top: a finished
   * subtask belongs in the same fold as a finished epic. Only the topmost
   * settled node of a run is taken, so a done epic arrives once with its
   * children under it rather than four times over.
   */
  const split = useMemo(() => {
    const live: TaskItem[] = [];
    const closed: TaskItem[] = [];
    const deferred: TaskItem[] = [];

    const walk = (items: TaskItem[], top: boolean) => {
      for (const item of items) {
        if (item.kind !== 'task') {
          if (top) live.push(item);
          continue;
        }
        const bucket = bucketFor(item);
        if (bucket === CLOSED_BUCKET) {
          closed.push(item);
          continue;
        }
        if (bucket === DEFERRED_BUCKET) {
          deferred.push(item);
          continue;
        }
        if (top) live.push(item);
        walk(item.children, false);
      }
    };
    walk(document.items, true);
    return { live, closed, deferred };
  }, [document]);

  /**
   * Work in flight is pinned to the top, whatever the order of the file.
   *
   * It is the only part of a plan somebody is holding in their head, so it goes
   * where the eye lands, with a gap under it rather than a heading: the status
   * glyphs already say what the group is.
   */
  const flight = useMemo(() => split.live.filter(inFlight), [split.live]);
  const waiting = useMemo(() => split.live.filter((item) => !inFlight(item)), [split.live]);

  // The cap is an opening view, not a filter: a filter, the export pass, or the
  // reader asking for more all lift it.
  const limit = props.initialItems ?? DEFAULT_INITIAL_ITEMS;
  const head = useMemo(
    () => headOfPlan(waiting, isPdf || showAll || filtersActive(filters) ? 0 : limit),
    [waiting, isPdf, showAll, filters, limit]
  );

  const flightRows = useMemo(
    () => buildRows(document, disclosure, filters, isPdf, flight),
    [document, disclosure, filters, isPdf, flight]
  );
  const rows = useMemo(
    () => buildRows(document, disclosure, filters, isPdf, head.shown),
    [document, disclosure, filters, isPdf, head.shown]
  );
  const closedRows = useMemo(
    () => buildRows(document, disclosure, filters, isPdf, split.closed, false),
    [document, disclosure, filters, isPdf, split.closed]
  );
  const deferredRows = useMemo(
    () => buildRows(document, disclosure, filters, isPdf, split.deferred, false),
    [document, disclosure, filters, isPdf, split.deferred]
  );

  const visibleTasks = useMemo(
    () =>
      isPdf
        ? document.tasks
        : flattenTasks(document.items).filter((task) => !filtersActive(filters) || matchesFilters(task, filters)),
    [document, filters, isPdf]
  );

  const cards = useMemo(() => {
    // A card is a leaf: an epic is context for its children, not a card of its
    // own, and showing both would count the same work twice.
    const leaves = visibleTasks.filter((task) => task.children.every((child) => child.kind === 'line'));
    return buildGroups(leaves, groupBy, document);
  }, [visibleTasks, groupBy, document]);

  const grouped = useMemo(
    () => (groupBy === 'none' ? [] : buildGroups(visibleTasks, groupBy, document)),
    [visibleTasks, groupBy, document]
  );

  /** The tree is the only view that folds rows; the others fold columns. */
  const tree = view === 'list' && groupBy === 'none';
  const columns = view === 'board' ? cards : grouped;

  const copyAll = useCallback(() => {
    const visibleRows = [
      ...flightRows,
      ...rows,
      ...(disclosure.groups.has(DEFERRED_BUCKET) ? [] : deferredRows),
      ...(disclosure.groups.has(CLOSED_BUCKET) ? [] : closedRows),
    ].map((row) => row.item);
    const lines = (tree ? visibleRows : visibleTasks)
      .slice()
      // On screen the settled work sits at the bottom; in the clipboard it goes
      // back where it came from, because the point of the payload is that it
      // matches the file.
      .sort((left, right) => left.line - right.line)
      .map((item) => item.source);
    copy('~all', lines.join('\n'));
  }, [flightRows, rows, closedRows, deferredRows, disclosure.groups, visibleTasks, tree, copy]);

  const totals = document.totals;
  const shellClass = [
    'mdxstudio-tasks',
    isPdf ? 'mdxstudio-tasks--pdf' : '',
    props.className || '',
  ]
    .filter(Boolean)
    .join(' ');

  if (document.tasks.length === 0 && document.items.length === 0) {
    return (
      <div className={shellClass} data-mdxstudio-theme={isPdf ? 'light' : context.themeCategory}>
        <div className="mdxstudio-tasks__empty">
          <ListChecks className="mdxstudio-tasks__icon-16 mdxstudio-tasks__icon-accent" />
          <span>TaskBoard: no tasks in this block. Write one line per item, starting with `- [ ]`.</span>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- *
   * One row
   * ---------------------------------------------------------------- */

  const renderRow = (row: Row) => {
    const item = row.item;

    if (item.kind === 'line') {
      // Malformed, and therefore shown exactly where it was written, dimmed,
      // with its own text intact. Never collected somewhere else.
      return (
        <div
          key={item.key}
          className="mdxstudio-tasks__row mdxstudio-tasks__row--plain"
          data-task-depth={Math.min(row.depth, 3)}
          style={{ marginInlineStart: `${row.depth * 18}px` }}
        >
          <span className="mdxstudio-tasks__plain-text">{item.text}</span>
        </div>
      );
    }

    const node = item;
    const descriptionOpen = isPdf || disclosure.descriptions.has(node.key);
    const prose = hasProse(node);

    return (
      <div
        key={node.key}
        data-pdf-keep-together="true"
        data-task-status={node.status}
        data-task-key={node.key}
        className={`mdxstudio-tasks__row mdxstudio-tasks__row--${node.status}${
          node.blocked ? ' mdxstudio-tasks__row--blocked' : ''
        }`}
        // The rule above a row, and how far it is inset, both come from depth.
        data-task-depth={Math.min(row.depth, 3)}
        style={{ marginInlineStart: `${row.depth * 18}px` }}
      >
        <span className="mdxstudio-tasks__rail">
          {row.hasChildren && !isPdf ? (
            <button
              type="button"
              className="mdxstudio-tasks__twisty"
              aria-expanded={row.open}
              aria-label={`${row.open ? 'Collapse' : 'Expand'} ${node.title || node.id || 'item'}`}
              onClick={() =>
                setDisclosure((current) => ({
                  ...current,
                  children: toggle(current.children, node.key),
                }))
              }
            >
              {row.open ? (
                <ChevronDown className="mdxstudio-tasks__icon-12" />
              ) : (
                <ChevronRight className="mdxstudio-tasks__icon-12" />
              )}
            </button>
          ) : (
            <span className="mdxstudio-tasks__twisty-gap" />
          )}

          {props.onToggleStatus && !isPdf ? (
            <button
              type="button"
              className={`mdxstudio-tasks__status mdxstudio-tasks__status--${node.status}`}
              data-cannot-complete={canComplete(node) ? undefined : 'true'}
              title={
                canComplete(node)
                  ? undefined
                  : `Finish the ${openInside(node)} item${openInside(node) === 1 ? '' : 's'} inside first`
              }
              aria-label={
                canComplete(node)
                  ? `${TASK_STATUS_LABELS[node.status]}: change status`
                  : `${TASK_STATUS_LABELS[node.status]}: change status. ${openInside(node)} items inside are not done`
              }
              onClick={() => props.onToggleStatus?.(node, nextStatusFor(node))}
            >
              <StatusGlyph status={node.status} />
            </button>
          ) : (
            <span
              className={`mdxstudio-tasks__status mdxstudio-tasks__status--${node.status}`}
              title={TASK_STATUS_LABELS[node.status]}
            >
              <StatusGlyph status={node.status} />
            </span>
          )}
        </span>

        <span className="mdxstudio-tasks__body">
          <span className="mdxstudio-tasks__headline">
            <TitleMarks node={node} />
            {row.context && row.context.length > 0 && (
              // Lifted out of the tree, so it says which tree.
              <span className="mdxstudio-tasks__context" title="Where this sits in the plan">
                {row.context.filter(Boolean).join(' › ')} ›
              </span>
            )}
            {node.id && <span className="mdxstudio-tasks__id">{node.id}</span>}
            {/* Cut to one line; the whole of it is in the tooltip. */}
            <span className="mdxstudio-tasks__title" title={node.title || undefined}>
              <InlineMarkdown text={node.title} />
            </span>
            {node.link &&
              (node.link.href ? (
                <a
                  className="mdxstudio-tasks__link"
                  href={node.link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {node.link.text}
                </a>
              ) : (
                <span className="mdxstudio-tasks__link">{node.link.text}</span>
              ))}
            {node.inconsistent && (
              <Chip
                tone="unmet"
                icon={OctagonAlert}
                title="This item is marked done while work inside it is not"
              >
                done over {node.rollup.total - node.rollup.done - node.rollup.counts.canceled} open
              </Chip>
            )}
            <Summary node={node} open={row.open} />
          </span>

          {prose && descriptionOpen && <Description node={node} />}
        </span>

        <MetaRail node={node} />
        {/* Slots keep their width, so the fields of every row line up. */}

        {!isPdf && (
          <span className="mdxstudio-tasks__actions">
            {/* A row with no prose keeps the space anyway, so the copy buttons
                line up down the column. It is blank, not a control: nothing to
                press, nothing to promise. */}
            {!prose && <span className="mdxstudio-tasks__action-gap" aria-hidden="true" />}
            {prose && (
              <button
                type="button"
                className={`mdxstudio-tasks__action mdxstudio-tasks__action--notes${
                  descriptionOpen ? ' mdxstudio-tasks__action--on' : ''
                }`}
                aria-expanded={descriptionOpen}
                aria-label={`${descriptionOpen ? 'Hide' : 'Show'} notes for ${node.title || 'item'}`}
                onClick={() =>
                  setDisclosure((current) => ({
                    ...current,
                    descriptions: toggle(current.descriptions, node.key),
                  }))
                }
              >
                <AlignLeft className="mdxstudio-tasks__icon-12" />
              </button>
            )}
            <button
              type="button"
              className="mdxstudio-tasks__action mdxstudio-tasks__action--quiet"
              aria-label={`Copy the source line for ${node.title || 'item'}`}
              onClick={() => copy(node.key, node.source)}
            >
              {copied === node.key ? (
                <Check className="mdxstudio-tasks__icon-12" />
              ) : (
                <Copy className="mdxstudio-tasks__icon-12" />
              )}
            </button>
            {props.onMove && (
              <>
                {(['up', 'down', 'out', 'in'] as const).map((direction) => {
                  const Icon =
                    direction === 'up'
                      ? ArrowUp
                      : direction === 'down'
                        ? ArrowDown
                        : direction === 'out'
                          ? ArrowLeft
                          : ArrowRight;
                  return (
                    <button
                      key={direction}
                      type="button"
                      className="mdxstudio-tasks__action mdxstudio-tasks__action--quiet"
                      aria-label={`Move ${node.title || 'item'} ${direction}`}
                      onClick={() => props.onMove?.(node, { direction })}
                    >
                      <Icon className="mdxstudio-tasks__icon-12" />
                    </button>
                  );
                })}
              </>
            )}
          </span>
        )}
      </div>
    );
  };

  const renderCard = (node: TaskNode) => (
    <div
      key={node.key}
      data-pdf-keep-together="true"
      data-task-status={node.status}
      className={`mdxstudio-tasks__card mdxstudio-tasks__card--${node.status}`}
    >
      {node.path.length > 0 && (
        <span className="mdxstudio-tasks__context">{node.path.filter(Boolean).join(' › ')}</span>
      )}
      <span className="mdxstudio-tasks__headline">
        <span className={`mdxstudio-tasks__status mdxstudio-tasks__status--${node.status}`}>
          <StatusGlyph status={node.status} />
        </span>
        {node.id && <span className="mdxstudio-tasks__id">{node.id}</span>}
        <span className="mdxstudio-tasks__title">
          <InlineMarkdown text={node.title} />
        </span>
        {node.link &&
          (node.link.href ? (
            <a
              className="mdxstudio-tasks__link"
              href={node.link.href}
              target="_blank"
              rel="noreferrer noopener"
            >
              {node.link.text}
            </a>
          ) : (
            <span className="mdxstudio-tasks__link">{node.link.text}</span>
          ))}
      </span>
      <MetaRail node={node} wrap />
      {/* A card is narrow, so its fields wrap rather than holding columns. */}
      {(isPdf || disclosure.descriptions.has(node.key)) && hasProse(node) && <Description node={node} />}
      {!isPdf && (
        <span className="mdxstudio-tasks__actions">
          {hasProse(node) && (
            <button
              type="button"
              className="mdxstudio-tasks__action mdxstudio-tasks__action--notes"
              aria-expanded={disclosure.descriptions.has(node.key)}
              aria-label={`Show notes for ${node.title || 'item'}`}
              onClick={() =>
                setDisclosure((current) => ({
                  ...current,
                  descriptions: toggle(current.descriptions, node.key),
                }))
              }
            >
              <AlignLeft className="mdxstudio-tasks__icon-12" />
            </button>
          )}
          <button
            type="button"
            className="mdxstudio-tasks__action mdxstudio-tasks__action--quiet"
            aria-label={`Copy the source line for ${node.title || 'item'}`}
            onClick={() => copy(node.key, node.source)}
          >
            {copied === node.key ? (
              <Check className="mdxstudio-tasks__icon-12" />
            ) : (
              <Copy className="mdxstudio-tasks__icon-12" />
            )}
          </button>
        </span>
      )}
    </div>
  );

  /* ---------------------------------------------------------------- *
   * Controls
   * ---------------------------------------------------------------- */

  const select = (
    label: string,
    value: string,
    options: Array<[string, string]>,
    onChange: (next: string) => void,
    allLabel: string
  ) => {
    // One option is not a choice, and a control that cannot change anything is
    // just chrome in the way of the plan.
    if (options.length < 2) return null;
    return (
      <label className="mdxstudio-tasks__control">
        <span className="mdxstudio-tasks__control-label">{label}</span>
        <select
          className="mdxstudio-tasks__select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{allLabel}</option>
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      </label>
    );
  };

  /** `value` is the node key; the reader sees the epic's own words. */
  const epicOptions: Array<[string, string]> = document.epics.map((epic) => [
    epic.key,
    [epic.id, epic.title].filter(Boolean).join(' ') || 'Untitled',
  ]);
  const named = (values: string[]): Array<[string, string]> =>
    values.map((value) => [value, value]);

  /**
   * A column heading, and the third disclosure on the board.
   *
   * A deck of forty finished cards is worth one line saying so, and the reader
   * decides which lines those are. In the export pass the heading is text: a
   * column folded on screen would otherwise be a column missing from the paper.
   */
  const groupHead = (group: Group, className: string) => {
    const folded = disclosure.groups.has(group.key);
    const body = (
      <>
        {!isPdf &&
          (folded ? (
            <ChevronRight className="mdxstudio-tasks__icon-12" />
          ) : (
            <ChevronDown className="mdxstudio-tasks__icon-12" />
          ))}
        <span className="mdxstudio-tasks__column-title">{group.label}</span>
        <span className="mdxstudio-tasks__column-count">{group.nodes.length}</span>
      </>
    );

    if (isPdf) return <div className={className}>{body}</div>;

    return (
      <button
        type="button"
        className={`${className} mdxstudio-tasks__column-toggle`}
        aria-expanded={!folded}
        aria-label={`${folded ? 'Expand' : 'Collapse'} ${group.label}`}
        onClick={() =>
          setDisclosure((current) => ({ ...current, groups: toggle(current.groups, group.key) }))
        }
      >
        {body}
      </button>
    );
  };

  const groupOptions: Array<[TaskGroupBy, string]> = [
    ['none', 'No grouping'],
    ['parent', 'Parent'],
    ['status', 'Status'],
    ['assignee', 'Assignee'],
    ['label', 'Label'],
    ['milestone', 'Milestone'],
    ['priority', 'Priority'],
  ];

  return (
    <div
      className={shellClass}
      data-mdxstudio-theme={isPdf ? 'light' : context.themeCategory}
      data-pdf-keep-together={document.tasks.length <= 8 ? 'true' : undefined}
    >
      <div className="mdxstudio-tasks__header">
        <span className="mdxstudio-tasks__heading">
          <ListChecks className="mdxstudio-tasks__icon-14 mdxstudio-tasks__icon-accent" />
          <span className="mdxstudio-tasks__name">{props.title || 'Plan'}</span>
        </span>
        <span className="mdxstudio-tasks__totals">
          <span>{totals.total} items</span>
          <span>{totals.done} done</span>
          {totals.blocked > 0 && <span>{totals.blocked} blocked</span>}
        </span>
      </div>

      {!isPdf && (
        <div className="mdxstudio-tasks__toolbar">
          <span className="mdxstudio-tasks__group">
            <button
              type="button"
              className={`mdxstudio-tasks__tab${view === 'list' ? ' mdxstudio-tasks__tab--on' : ''}`}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              List
            </button>
            <button
              type="button"
              className={`mdxstudio-tasks__tab${view === 'board' ? ' mdxstudio-tasks__tab--on' : ''}`}
              aria-pressed={view === 'board'}
              onClick={() => setView('board')}
            >
              Board
            </button>
          </span>

          <label className="mdxstudio-tasks__control">
            <span className="mdxstudio-tasks__control-label">Group</span>
            <select
              className="mdxstudio-tasks__select"
              value={groupBy}
              onChange={(event) => setGroupBy(event.target.value as TaskGroupBy)}
            >
              {groupOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          {select(
            'Epic',
            filters.epic,
            epicOptions,
            (epic) => setFilters((current) => ({ ...current, epic })),
            'Every epic'
          )}
          {select(
            'Assignee',
            filters.assignee,
            named(document.assignees),
            (assignee) => setFilters((current) => ({ ...current, assignee })),
            'Anyone'
          )}
          {select(
            'Label',
            filters.label,
            named(document.labels),
            (label) => setFilters((current) => ({ ...current, label })),
            'Any label'
          )}
          {select(
            'Milestone',
            filters.milestone,
            named(document.milestones),
            (milestone) => setFilters((current) => ({ ...current, milestone })),
            'Any milestone'
          )}

          {document.tasks.length > 1 && (
            <input
              type="search"
              className="mdxstudio-tasks__search"
              placeholder="Filter text"
              aria-label="Filter tasks by text"
              value={filters.text}
              onChange={(event) => setFilters((current) => ({ ...current, text: event.target.value }))}
            />
          )}

          <span className="mdxstudio-tasks__spacer" />

          {/* Whatever the current view folds - rows in the tree, columns
              everywhere else - these two open and close all of it. */}
          <button
            type="button"
            className="mdxstudio-tasks__action"
            aria-label={tree ? 'Expand every item' : 'Expand every column'}
            onClick={() =>
              setDisclosure((current) =>
                tree
                  ? { ...current, children: new Set(document.tasks.map((task) => task.key)) }
                  : { ...current, groups: new Set() }
              )
            }
          >
            <ChevronsUpDown className="mdxstudio-tasks__icon-12" />
          </button>
          <button
            type="button"
            className="mdxstudio-tasks__action"
            aria-label={tree ? 'Collapse every item' : 'Collapse every column'}
            onClick={() =>
              setDisclosure((current) =>
                tree
                  ? { ...current, children: new Set() }
                  : { ...current, groups: new Set(columns.map((group) => group.key)) }
              )
            }
          >
            <ChevronsDownUp className="mdxstudio-tasks__icon-12" />
          </button>

          <button
            type="button"
            className="mdxstudio-tasks__action"
            aria-label="Copy every visible line"
            onClick={copyAll}
          >
            {copied === '~all' ? (
              <Check className="mdxstudio-tasks__icon-12" />
            ) : (
              <Copy className="mdxstudio-tasks__icon-12" />
            )}
          </button>
        </div>
      )}

      {view === 'board' && !isPdf ? (
        <div className="mdxstudio-tasks__columns">
          {cards.map((group) => (
            <div key={group.key} className="mdxstudio-tasks__column">
              {groupHead(group, 'mdxstudio-tasks__column-head')}
              {(isPdf || !disclosure.groups.has(group.key)) && group.nodes.map(renderCard)}
            </div>
          ))}
          {cards.length === 0 && (
            <p className="mdxstudio-tasks__none">Nothing matches the current filter.</p>
          )}
        </div>
      ) : groupBy !== 'none' ? (
        <div className="mdxstudio-tasks__sections">
          {grouped.map((group) => (
            <div key={group.key} className="mdxstudio-tasks__section">
              {groupHead(group, 'mdxstudio-tasks__section-head')}
              {(isPdf || !disclosure.groups.has(group.key)) &&
                group.nodes.map((node) =>
                  renderRow({ item: node, depth: 0, open: false, hasChildren: false })
                )}
            </div>
          ))}
          {grouped.length === 0 && (
            <p className="mdxstudio-tasks__none">Nothing matches the current filter.</p>
          )}
        </div>
      ) : (
        <div className="mdxstudio-tasks__list">
          {flightRows.length > 0 && (
            <div className="mdxstudio-tasks__flight">{flightRows.map(renderRow)}</div>
          )}
          {rows.map(renderRow)}
          {flightRows.length === 0 &&
            rows.length === 0 &&
            closedRows.length === 0 &&
            deferredRows.length === 0 && (
              <p className="mdxstudio-tasks__none">Nothing matches the current filter.</p>
            )}

          {!isPdf && (head.hidden > 0 || showAll) && (
            <button type="button" className="mdxstudio-tasks__more" onClick={() => setShowAll(!showAll)}>
              {showAll ? (
                <>
                  <ChevronsDownUp className="mdxstudio-tasks__icon-12" />
                  Show the next few again
                </>
              ) : (
                <>
                  <ChevronsUpDown className="mdxstudio-tasks__icon-12" />
                  View {head.hidden} more
                </>
              )}
            </button>
          )}

          {/* Settled work, at the bottom, folded. */}
          {deferredRows.length > 0 && (
            <div className="mdxstudio-tasks__bucket">
              {groupHead(
                {
                  key: DEFERRED_BUCKET,
                  label: 'Deferred',
                  nodes: flattenTasks(split.deferred),
                },
                'mdxstudio-tasks__section-head'
              )}
              {(isPdf || !disclosure.groups.has(DEFERRED_BUCKET)) && deferredRows.map(renderRow)}
            </div>
          )}
          {closedRows.length > 0 && (
            <div className="mdxstudio-tasks__bucket">
              {groupHead(
                {
                  key: CLOSED_BUCKET,
                  label: 'Completed and canceled',
                  nodes: flattenTasks(split.closed),
                },
                'mdxstudio-tasks__section-head'
              )}
              {(isPdf || !disclosure.groups.has(CLOSED_BUCKET)) && closedRows.map(renderRow)}
            </div>
          )}
        </div>
      )}

      {isPdf && document.inconsistencies.length > 0 && (
        <p className="mdxstudio-tasks__footnote">
          {document.inconsistencies.length} item
          {document.inconsistencies.length === 1 ? ' is' : 's are'} marked done over children that are
          not.
        </p>
      )}
    </div>
  );
}

export default TaskBoard;
