# @mdxstudio/tasks

`TaskBoard` — a plan checklist that stays a plain-text plan.

A ```` ```tasks ```` fence is one node type, nested by indentation. The
component reads it, derives what a reader needs — progress, what is blocked,
inherited owners — and changes nothing. The file is the plan; this is how a
person looks at it while an agent edits it.

```bash
npm install @mdxstudio/tasks
```

```ts
import { createRendererRegistry } from '@mdxstudio/react';
import { tasksPlugin } from '@mdxstudio/tasks';
import '@mdxstudio/tasks/styles.css';

export const registry = createRendererRegistry(tasksPlugin);
```

That registers `<TaskBoard>`, its alias `<Tasks>`, and the `tasks` fence
language.

## The format

````md
```tasks
- [ ] AG-1: Delete the engine   needs: AG-0b, AG-6a   @me   !p1   #risk
    Remove the runner, the trade workflows and the trade machinery.
    The API must still boot and serve the frontend routes.
    - [ ] Prune the schema package
- [→] Multi-layer contours   trigger: DW-1c
- [-] Typed checklist subsystem   reason: rejected as over-engineering
```
````

One line is one item. Indent by four spaces to nest, to any depth. There is no
separate epic syntax: depth is depth.

### Statuses

| Marker | Status |
| --- | --- |
| `[ ]` | to do |
| `[~]` | in progress |
| `[x]` or `[X]` | done |
| `[!]` | blocked |
| `[→]` or `[>]` | deferred |
| `[-]` | canceled |

An unrecognised marker is **not a task**. `- [?] something` stays exactly where
it was written, dimmed, as a plain line — guessing at a status is how a plan
gets mangled. `[]` and `[ ]` are the same empty box.

### Ids

An id is a single token at the head of the title, ending in a colon:
`- [ ] AG-1: Delete the engine`. It is optional, and it is only an id because of
the colon — `- [→] Multi-layer contours` has **no** id, and neither has
`- [ ] Fix the parser: it drops rows`, whose colon is inside a sentence rather
than after a leading token.

Ids are what `needs:` resolves against, case-insensitively.

### Fields

Fields go after the title, in any order, and are stripped from what is shown.

| Field | Written | Notes |
| --- | --- | --- |
| Assignee | `@ann` | Several allowed. Inherits down. |
| Label | `#risk` | Several allowed. Inherits down. |
| Milestone | `milestone: v1` | Inherits down. |
| Dependencies | `needs: AG-1, AG-6a` | Never inherits. |
| Estimate | `est: 3d` | **Do not write this.** Parsed and tolerated, never shown. |
| Due date | `due: 2026-04-01` | |
| Priority | `!p1`…`!p4` | Aliases `!urgent` `!high` `!med` `!low`. |
| Trigger | `trigger: when DW-1c lands` | Free text, **runs to end of line**. |
| Reason | `reason: over-engineered` | Free text, **runs to end of line**. |

Two rules are worth committing to memory:

- **`trigger:` and `reason:` swallow the rest of the line.** Everything after
  them is their value, sigils included. Write them last.
- **Every other value stops at the next field.** So a title written *after* a
  field becomes part of that field's value. Titles first, fields last.

A `key: value` whose key is not in the table above is **not a field** — it stays
in the title. That is deliberate: a title is far more likely to contain a colon
than a plan is to invent a new field.

A trailing markdown link is lifted off before anything looks for a `#label`, so
`[spec](doc.mdx#ids)` is a link and not a tag. Only `http`, `https`, `mailto`
and relative targets are linked; anything else keeps its text and loses its
href.

### Descriptions

Indented lines that are **not** bullets, deeper than the bullet above them, are
that item's description. Blank lines separate paragraphs; lines within one
paragraph join as markdown joins them. Inline markdown works: `` `code` ``,
`**bold**`, `*italic*`, `[link](url)`.

```tasks
- [ ] AG-1: Delete the engine
    Remove the runner and the trade workflows.
    The API must still boot.

    A second paragraph, still about AG-1.
    - [ ] A child, because it is a bullet
```

Prose belongs to the deepest item it is indented past, so a line indented level
with a child goes back to the parent.

## What is derived, and never written

- **Progress** — every parent shows `done/total` over its whole subtree.
  Canceled work leaves the divisor: it is out of scope, not outstanding.
- **Blocked** — `[!]`, or any dependency that is not done. This is the one
  derived state the board draws, because it is the row that needs somebody.
- **Readiness** — a to-do whose dependencies are all done or absent is
  `node.ready`. It is **not drawn anywhere**: a word repeated down every row
  stops being read. It is there for a host that wants it.
- **Estimates** — `est:` is parsed into days and points and rolled up over the
  subtree, and **none of it is drawn**. See the note below.
- **Inheritance** — `@assignee`, `#label` and `milestone:` flow down until a
  descendant declares its own, which replaces rather than adds to what came
  down. `status` and `needs:` never inherit.

A parent marked done over children that are not is an **inconsistency, not an
error**: both markers are the author's, so both are kept and the row says
`done over N open`. Nothing here corrects a plan.

### Do not write estimates

`est:` is parsed, because a file that already contains one must not be mangled,
and it is rolled up so a host can read it. **It is drawn nowhere, and it should
not be written.** An estimate on a task in a plan like this is a guess dressed
as a number: it is never revised, it is wrong by the time anybody reads it, and
a column of durations makes a plan look like a forecast when it is a list of
work. If you want to say something about size, say it in the description, in
words, where it can be argued with.

The same goes for anything derived from estimates — remaining time, burn-down,
"N days left". None of it is shown, and none of it is coming.

## Reading it

- **Children are collapsed on load, top level included** — with one exception:
  the path down to any `[~]` opens, so the first thing visible is where the work
  currently is. A collapsed parent still carries its progress ring, and says
  so when something inside it is blocked; the exact counts are in its tooltip.
- **The list opens on the head of the plan** — everything in flight, plus the
  next few items in document order, and `View N more` for the rest. Set the
  window with `initialItems` (default 6; `0` shows everything).
- **Settled work sinks.** A top-level item that is done, canceled or deferred,
  with nothing live left inside it, moves to a folded bucket at the foot of the
  list — completed and canceled together, deferred in its own. A done item that
  still has open children stays where it is: that disagreement is the one thing
  the board must not fold away. A finished **subtask** sinks too, and appears
  in the bucket with the greyed path of the tree it came from.
- **A row's prose and a row's children are separate disclosures.** Opening one
  never touches the other. An item with no prose has no prose control.
- **Views** — a list (the tree) and a board of leaf cards.
- **The board is the workflow.** Five status columns, always the same five and
  always in this order: **Backlog** `[ ]`, **In progress** `[~]`, **Blocked**
  `[!]`, **Deferred** `[→]`, **Completed and canceled** `[x]` `[-]`. Blocked
  keeps a column of its own because it names the work that needs somebody today;
  done and canceled share the last one because neither is work anybody is going
  to pick up. Those last two columns *are* the list's buckets — same labels,
  same fold state, so the two views never disagree about where settled work
  went. **An empty column is still drawn**: the columns are the workflow, not a
  summary of the file, and nothing in progress is worth as much of the reader's
  attention as three things in progress. Narrower than two columns — a preview
  pane, usually — the board stacks into one deck per status, in the same order.
- **Grouping adds lanes; it does not replace the columns.** Group by parent,
  assignee, label, milestone or priority and the board becomes one lane per
  group, each with the same columns: a lane says which epic, a column says how
  far along. The same control makes sections in the list. Status is not offered
  on a board, because it is already the layout.
- **Every column, lane and grouped section is itself collapsible**, from its own
  heading, and the heading keeps its count while it is folded.
- **Filters** — epic, assignee, label, milestone and free text. Each appears
  only when it would have more than one option to offer.
  **An epic is a top-level item that has children** — the format declares no
  such thing, so it is derived from shape like everything else — and choosing
  one scopes the whole board to its subtree. A filter *opens* the way down to
  what it matched; it does not hold those rows open, so the twisties keep
  working while a filter is on.
- **Copy** hands over the **verbatim source line** — the exact string, so it can
  be pasted to an agent and matched against the file. The toolbar's copy button
  does the same for every visible line, in document order.

## Read-only, with a seam

The component holds no document state. Nothing ticks, nothing persists, nothing
is written to `localStorage`. Two optional props open a seam for the host:

```tsx
<TaskBoard
  source={plan}
  onToggleStatus={(node, next) => applyEdit(node.line, next)}
  onMove={(node, move) => reorder(node.line, move.direction)}
/>
```

Each one renders its controls **only when it is supplied**. Unwired, the board
shows no control that appears to change the plan and does not. `node.line` and
`node.source` are what an editor needs to find the line again: the VS Code
extension can turn a tick into a `WorkspaceEdit`, so it goes through the
editor's undo stack and dirty buffer like any other edit.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `source` | `string` | The plan. A fence passes it as children instead. |
| `title` | `string` | Header text, default `Plan`. |
| `defaultView` | `'list' \| 'board'` | |
| `defaultGroupBy` | `'none' \| 'parent' \| 'status' \| 'assignee' \| 'label' \| 'milestone' \| 'priority'` | |
| `initialItems` | `number` | Top-level items shown before `View more`. Default 6; `0` for all. |
| `onToggleStatus` | `(node, next) => void` | Renders the status control. |
| `onMove` | `(node, move) => void` | Renders the move controls. |

## PDF export

The export pass strips every `button`, so in `renderMode === 'pdf'` the board
renders no buttons at all and everything is already open: every child, every
description, the completed bucket. A board exports as a board — every column,
every lane, every card, stacked one column per deck so a card keeps a readable
width. What reaches the paper is the whole plan.

## Parsing it yourself

`parseTaskBoard(source)` is exported, returns a `TaskDocument`, and **never
throws** — anything it cannot read comes back as a plain line where it was
written.

```ts
import { parseTaskBoard } from '@mdxstudio/tasks';

const plan = parseTaskBoard(source);
plan.tasks.filter((task) => task.blocked).map((task) => task.source);
```

## License

MIT
