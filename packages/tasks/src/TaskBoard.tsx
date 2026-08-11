/**
 * `<TaskBoard>` - an implementation-plan checklist, read as a board.
 *
 * The source is the ```tasks fence body, which is the checklist the plan is
 * already written in (see `parseTasks.ts` for the format). The board adds the
 * three things a plan file cannot show you by being read top to bottom:
 *
 * - **Lanes.** In progress, then todo, then blocked, then deferred, with
 *   finished work collapsed at the bottom behind a disclosure that counts it.
 *   Done is out of sight but never out of reach.
 * - **Ready now.** The todo tasks whose `needs:` are all satisfied - the answer
 *   to "what can I pick up", without reading the file and holding the
 *   dependency graph in your head.
 * - **Progress**, per group, computed from the markers rather than authored.
 *   It is always the whole group's progress: narrowing the board with a filter
 *   changes what you can see, not what the plan says has been done.
 *
 * Three constraints shape the rest of it:
 *
 * **It never throws.** A component that throws is replaced by an error banner,
 * which is a worse outcome than a mis-parsed row. Anything unreadable is kept
 * as a note and the board renders around it.
 *
 * **In `renderMode: 'pdf'` there are no controls at all.** The exporter deletes
 * every `button` from the tree it captures, so on paper the board renders flat
 * and fully expanded - every lane, every finished task, no toggles, nothing
 * that was only reachable behind one.
 *
 * **It is read-only.** Ticking a box here would have nowhere to write; the
 * document is the source of truth and it is edited by editing the document.
 */

import React, { useContext, useMemo, useState } from 'react';
import {
  Circle,
  CircleCheck,
  CircleDot,
  ChevronDown,
  ChevronRight,
  Clock,
  ListTodo,
  OctagonAlert,
  User,
  Zap,
} from 'lucide-react';
import { MdxRenderContext } from '@mdxstudio/core';

import { InlineMarkdown, safeHref } from './inlineMarkdown';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_ORDER,
  findTask,
  isReady,
  parseTaskBoard,
} from './parseTasks';
import type { Task, TaskBoardModel, TaskGroup, TaskStatus } from './parseTasks';

/** `lanes` stacks the statuses; `kanban` puts them side by side as columns. */
export type TaskBoardView = 'lanes' | 'kanban';

export interface TaskBoardProps {
  /** The fence body. `<TaskBoard>` used as a tag takes its text children. */
  children?: React.ReactNode;
  /** The same thing as a prop, for a host that has the text already. */
  source?: string;
  title?: string;
  subtitle?: string;
  /** Which view to open in. Ignored in the PDF pass, which is always flat. */
  view?: TaskBoardView;
  className?: string;
  /** Passed by the renderer for a fenced block. Unused. */
  language?: string;
}

/** The lanes, minus done, which has a disclosure of its own at the bottom. */
const OPEN_STATUSES = TASK_STATUS_ORDER.filter((status) => status !== 'done');

const STATUS_ICONS: Record<TaskStatus, typeof Circle> = {
  'in-progress': CircleDot,
  todo: Circle,
  blocked: OctagonAlert,
  deferred: Clock,
  done: CircleCheck,
};

/** Text out of whatever the renderer handed over, without ever throwing. */
function toSourceText(node: React.ReactNode, depth = 0): string {
  if (node === null || node === undefined || node === false || node === true) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (depth > 6) return '';
  if (Array.isArray(node)) return node.map((child) => toSourceText(child, depth + 1)).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return toSourceText(props?.children, depth + 1);
  }
  return '';
}

function statusLabel(status: TaskStatus): string {
  return TASK_STATUS_LABELS[status];
}

function StatusIcon({ status }: { status: TaskStatus }) {
  const Icon = STATUS_ICONS[status];
  return <Icon className="mdxstudio-tasks__icon" aria-hidden="true" />;
}

function Progress({ percent }: { percent: number }) {
  return (
    <span className="mdxstudio-tasks__bar" role="presentation">
      <span className="mdxstudio-tasks__bar-fill" style={{ width: `${percent}%` }} />
    </span>
  );
}

function Needs({ task, board }: { task: Task; board: TaskBoardModel }) {
  if (task.needs.length === 0) return null;
  return (
    <div className="mdxstudio-tasks__needs">
      <span className="mdxstudio-tasks__needs-label">Blocked by</span>
      {task.needs.map((id) => {
        const dependency = findTask(board, id);
        const met = dependency?.status === 'done';
        return (
          <span
            key={id}
            className="mdxstudio-tasks__need"
            data-met={met ? 'true' : 'false'}
            data-need-id={id}
          >
            <span className="mdxstudio-tasks__need-id">{id}</span>
            {dependency?.title ? (
              <span className="mdxstudio-tasks__need-title">
                <InlineMarkdown text={dependency.title} />
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function Card({
  task,
  board,
  ready,
  showGroup,
}: {
  task: Task;
  board: TaskBoardModel;
  ready: boolean;
  showGroup: boolean;
}) {
  const href = task.link ? safeHref(task.link.href) : null;
  return (
    <li
      className="mdxstudio-tasks__card"
      data-status={task.status}
      data-task-id={task.id ?? ''}
      data-ready={ready ? 'true' : undefined}
    >
      <StatusIcon status={task.status} />
      <div className="mdxstudio-tasks__card-body">
        <div className="mdxstudio-tasks__card-head">
          {task.id ? <span className="mdxstudio-tasks__id">{task.id}</span> : null}
          <span className="mdxstudio-tasks__title">
            <InlineMarkdown text={task.title} />
          </span>
          {ready ? <span className="mdxstudio-tasks__flag">ready</span> : null}
        </div>
        {task.owner || task.tags.length > 0 || href || (showGroup && task.group) ? (
          <div className="mdxstudio-tasks__meta">
            {showGroup && task.group ? (
              <span className="mdxstudio-tasks__meta-group">{task.group}</span>
            ) : null}
            {task.owner ? (
              <span className="mdxstudio-tasks__owner">
                <User className="mdxstudio-tasks__icon-12" aria-hidden="true" />
                {task.owner}
              </span>
            ) : null}
            {task.tags.map((tag) => (
              <span key={tag.label} className="mdxstudio-tasks__tag" data-tag-key={tag.key}>
                #{tag.label}
              </span>
            ))}
            {href ? (
              <a className="mdxstudio-tasks__link" href={href} rel="noreferrer">
                {task.link?.label}
              </a>
            ) : null}
          </div>
        ) : null}
        <Needs task={task} board={board} />
      </div>
    </li>
  );
}

function Cards({
  tasks,
  board,
  ready,
  showGroup = false,
}: {
  tasks: Task[];
  board: TaskBoardModel;
  /** The tasks nothing is blocking, so a card can say so. */
  ready: Set<Task>;
  showGroup?: boolean;
}) {
  return (
    <ul className="mdxstudio-tasks__cards">
      {tasks.map((task) => (
        <Card
          key={task.key}
          task={task}
          board={board}
          ready={ready.has(task)}
          showGroup={showGroup}
        />
      ))}
    </ul>
  );
}

function Disclosure({
  open,
  count,
  onToggle,
}: {
  open: boolean;
  count: number;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      className="mdxstudio-tasks__disclosure"
      aria-expanded={open}
      onClick={onToggle}
    >
      <Chevron className="mdxstudio-tasks__icon-14" aria-hidden="true" />
      Done ({count})
    </button>
  );
}

interface Filters {
  query: string;
  owner: string;
  tag: string;
}

const EMPTY_FILTERS: Filters = { query: '', owner: '', tag: '' };

function matches(task: Task, filters: Filters): boolean {
  if (filters.owner && task.owner !== filters.owner) return false;
  if (filters.tag && !task.tags.some((tag) => tag.label === filters.tag)) return false;
  const query = filters.query.trim().toLowerCase();
  if (!query) return true;
  const haystack = [task.id ?? '', task.title, task.owner ?? '', task.group, ...task.tags.map((tag) => tag.label)]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export function TaskBoard(props: TaskBoardProps) {
  const context = useContext(MdxRenderContext);
  const isPdf = context.renderMode === 'pdf';

  const source = useMemo(() => {
    const fromProp = typeof props.source === 'string' ? props.source : '';
    return fromProp || toSourceText(props.children);
  }, [props.source, props.children]);

  const board = useMemo(() => parseTaskBoard(source), [source]);

  const [view, setView] = useState<TaskBoardView>(props.view === 'kanban' ? 'kanban' : 'lanes');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const active = isPdf ? EMPTY_FILTERS : filters;
  const filtering = Boolean(active.query.trim() || active.owner || active.tag);

  const visible = useMemo(
    () => board.tasks.filter((task) => matches(task, active)),
    [board, active]
  );
  const visibleSet = useMemo(() => new Set(visible), [visible]);
  const readySet = useMemo(
    () => new Set(board.tasks.filter((task) => isReady(board, task))),
    [board]
  );
  const readyVisible = visible.filter((task) => readySet.has(task));

  const isOpen = (key: string) => Boolean(expanded[key]);
  const toggle = (key: string) => setExpanded((current) => ({ ...current, [key]: !current[key] }));

  const title = props.title || 'Tasks';

  if (board.tasks.length === 0 && board.groups.length === 0) {
    return (
      <div className={`mdxstudio-tasks ${props.className || ''}`.trim()} data-pdf-keep-together="true">
        <div className="mdxstudio-tasks__empty">
          <ListTodo className="mdxstudio-tasks__icon-16" aria-hidden="true" />
          <span>
            TaskBoard: no tasks to show. Write a checklist in the fence - `- [ ] AG-1 do the thing`.
          </span>
        </div>
      </div>
    );
  }

  const groupsToRender = filtering
    ? board.groups.filter((group) => group.tasks.some((task) => visibleSet.has(task)))
    : board.groups;

  const laneFor = (group: TaskGroup, status: TaskStatus) =>
    group.tasks.filter((task) => task.status === status && visibleSet.has(task));

  const renderLanes = () =>
    groupsToRender.map((group) => {
      const done = laneFor(group, 'done');
      const doneKey = `done:${group.id}`;
      const doneOpen = isPdf || isOpen(doneKey);
      return (
        <section
          key={group.id}
          className="mdxstudio-tasks__group"
          data-group-id={group.id}
          data-percent={group.percent}
        >
          <div className="mdxstudio-tasks__group-head">
            <h4 className="mdxstudio-tasks__group-title">
              <InlineMarkdown text={group.label || title} />
            </h4>
            <span className="mdxstudio-tasks__group-count">
              {group.counts.done}/{group.counts.total} done · {group.percent}%
            </span>
            <Progress percent={group.percent} />
          </div>

          {group.notes.map((note) => (
            <p key={`${note.line}`} className="mdxstudio-tasks__note">
              {note.text}
            </p>
          ))}

          {OPEN_STATUSES.map((status) => {
            const tasks = laneFor(group, status);
            if (tasks.length === 0) return null;
            return (
              <div key={status} className="mdxstudio-tasks__lane" data-status={status}>
                <h5 className="mdxstudio-tasks__lane-title">
                  <StatusIcon status={status} />
                  {statusLabel(status)}
                  <span className="mdxstudio-tasks__lane-count">{tasks.length}</span>
                </h5>
                <Cards tasks={tasks} board={board} ready={readySet} />
              </div>
            );
          })}

          {done.length > 0 ? (
            <div className="mdxstudio-tasks__lane mdxstudio-tasks__lane--done" data-status="done">
              {isPdf ? (
                <h5 className="mdxstudio-tasks__lane-title">
                  <StatusIcon status="done" />
                  Done
                  <span className="mdxstudio-tasks__lane-count">{done.length}</span>
                </h5>
              ) : (
                <Disclosure
                  open={doneOpen}
                  count={done.length}
                  onToggle={() => toggle(doneKey)}
                />
              )}
              {doneOpen ? <Cards tasks={done} board={board} ready={readySet} /> : null}
            </div>
          ) : null}
        </section>
      );
    });

  const renderKanban = () => {
    const doneKey = 'done:board';
    const doneOpen = isOpen(doneKey);
    return (
      <div className="mdxstudio-tasks__columns">
        {TASK_STATUS_ORDER.map((status) => {
          const tasks = visible.filter((task) => task.status === status);
          const done = status === 'done';
          return (
            <div key={status} className="mdxstudio-tasks__column" data-status={status}>
              {done ? (
                <Disclosure open={doneOpen} count={tasks.length} onToggle={() => toggle(doneKey)} />
              ) : (
                <h5 className="mdxstudio-tasks__lane-title">
                  <StatusIcon status={status} />
                  {statusLabel(status)}
                  <span className="mdxstudio-tasks__lane-count">{tasks.length}</span>
                </h5>
              )}
              {done && !doneOpen ? null : (
                <Cards tasks={tasks} board={board} ready={readySet} showGroup />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      className={`mdxstudio-tasks${isPdf ? ' mdxstudio-tasks--pdf' : ''} ${props.className || ''}`.trim()}
      data-pdf-keep-together="true"
    >
      <div className="mdxstudio-tasks__header">
        <span className="mdxstudio-tasks__heading">
          <ListTodo className="mdxstudio-tasks__icon-14 mdxstudio-tasks__icon-accent" aria-hidden="true" />
          <span className="mdxstudio-tasks__board-title">{title}</span>
        </span>
        {props.subtitle ? (
          <span className="mdxstudio-tasks__subtitle">{props.subtitle}</span>
        ) : null}
        <span className="mdxstudio-tasks__summary">
          {board.counts.done}/{board.counts.total} done · {board.counts['in-progress']} in progress ·{' '}
          {board.counts.todo} todo
          {board.counts.blocked > 0 ? ` · ${board.counts.blocked} blocked` : ''}
          {board.counts.deferred > 0 ? ` · ${board.counts.deferred} deferred` : ''}
        </span>
        <Progress percent={board.percent} />
      </div>

      {isPdf ? null : (
        <div className="mdxstudio-tasks__controls">
          <div className="mdxstudio-tasks__views" role="group" aria-label="View">
            {(['lanes', 'kanban'] as TaskBoardView[]).map((option) => (
              <button
                key={option}
                type="button"
                className="mdxstudio-tasks__view"
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                {option === 'lanes' ? 'Lanes' : 'Kanban'}
              </button>
            ))}
          </div>
          {board.tasks.length > 1 ? (
            <input
              type="search"
              className="mdxstudio-tasks__search"
              placeholder="Filter tasks"
              aria-label="Filter tasks"
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
            />
          ) : null}
          {board.owners.length > 1 ? (
            <select
              className="mdxstudio-tasks__select"
              aria-label="Owner"
              value={filters.owner}
              onChange={(event) =>
                setFilters((current) => ({ ...current, owner: event.target.value }))
              }
            >
              <option value="">All owners</option>
              {board.owners.map((owner) => (
                <option key={owner} value={owner}>
                  @{owner}
                </option>
              ))}
            </select>
          ) : null}
          {board.tags.length > 1 ? (
            <select
              className="mdxstudio-tasks__select"
              aria-label="Tag"
              value={filters.tag}
              onChange={(event) =>
                setFilters((current) => ({ ...current, tag: event.target.value }))
              }
            >
              <option value="">All tags</option>
              {board.tags.map((tag) => (
                <option key={tag} value={tag}>
                  #{tag}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      )}

      {readyVisible.length > 0 ? (
        <div className="mdxstudio-tasks__ready">
          <span className="mdxstudio-tasks__ready-head">
            <Zap className="mdxstudio-tasks__icon-14" aria-hidden="true" />
            Ready now
            <span className="mdxstudio-tasks__lane-count">{readyVisible.length}</span>
          </span>
          <ul className="mdxstudio-tasks__ready-list">
            {readyVisible.map((task) => (
              <li
                key={task.key}
                className="mdxstudio-tasks__ready-item"
                data-task-id={task.id ?? ''}
              >
                {task.id ? <span className="mdxstudio-tasks__id">{task.id}</span> : null}
                <span className="mdxstudio-tasks__title">
                  <InlineMarkdown text={task.title} />
                </span>
                {task.owner ? (
                  <span className="mdxstudio-tasks__owner">@{task.owner}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {filtering && visible.length === 0 ? (
        <p className="mdxstudio-tasks__none">No tasks match this filter.</p>
      ) : view === 'kanban' && !isPdf ? (
        renderKanban()
      ) : (
        renderLanes()
      )}
    </div>
  );
}
