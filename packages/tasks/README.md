# @mdxstudio/tasks

`<TaskBoard>` (also `<Tasks>`) for mdxstudio, and the ```` ```tasks ```` fence
that mounts it. An implementation-plan checklist — the one you already write —
read as lanes, a kanban board and a "ready now" list. Read-only: the document
stays the source of truth.

## Install

```sh
npm install @mdxstudio/tasks @mdxstudio/core @mdxstudio/react react
```

| Peer              | Range     |
| ----------------- | --------- |
| `react`           | `^19.0.0` |
| `@mdxstudio/core` | `^0.2.2`  |

## Usage

```ts
import { createRendererRegistry } from '@mdxstudio/react';
import { tasksPlugin } from '@mdxstudio/tasks';

export const registry = createRendererRegistry(tasksPlugin);
```

Then write the checklist in a fence:

````mdx
```tasks
## AG — Agentic platform
- [x] AG-0a Branch cut and pushed
- [~] AG-0b Agentic code into git @me #infra
- [ ] AG-1 The deletion — needs: AG-0b #risk:high [details](details/agentic-platform.mdx)
- [!] MX-6 TaskBoard — blocked on extension config support
- [→] DW-4 Multi-layer contours (trigger: DW-1c)
```
````

## The format

| Piece                       | Means                                                             |
| --------------------------- | ----------------------------------------------------------------- |
| `## Heading`                 | starts a group; anything above the first one is an unnamed group   |
| `- [ ]` · `- [~]` · `- [x]`  | todo · in progress · done                                          |
| `- [!]` · `- [→]` (or `>`)   | blocked · deferred                                                 |
| `AG-1`, `DW-2c`, `C2.1`      | leading `[A-Z][A-Za-z0-9]*[-.][A-Za-z0-9.]+` token is the task id  |
| `needs: AG-0b, AG-0a`        | dependency ids, any case, anywhere in the line                     |
| `@me`                        | owner (the first one)                                              |
| `#infra`, `#risk:high`       | tags                                                               |
| `[details](path.mdx)` at end | the task's detail link                                             |
| everything left             | the title, rendered as inline markdown                             |

`*` and `+` are bullets too, and an empty box (`- []`) is todo. **A line that
is none of these is kept verbatim as a note** — a mis-typed row never
disappears, and nothing here ever throws.

## Views

- **Lanes** (default) — In progress · Todo · Blocked · Deferred per group, with
  finished work collapsed at the bottom behind a disclosure that counts it.
- **Kanban** — the same tasks as columns across the whole document.
- **Ready now** — the todo tasks whose `needs:` are all done, so "what can I
  pick up" needs no reading. An id the document does not contain is not
  something to wait for.
- **Progress** per group, computed from the markers rather than authored, and
  always for the whole group: a filter changes what you see, not what is done.
- **Filters** by owner and by tag appear only when there is more than one to
  choose from, next to a text filter over ids, titles, owners and tags.

In `renderMode: 'pdf'` the board renders flat and fully expanded, with no
controls at all: the exporter deletes every `button`, so nothing may be
reachable only behind one.

## Props

`<TaskBoard>` takes its source from the fence body, or:

| Prop       | Type                  | Default   |
| ---------- | --------------------- | --------- |
| `source`   | `string`              | children  |
| `title`    | `string`              | `'Tasks'` |
| `subtitle` | `string`              | —         |
| `view`     | `'lanes' \| 'kanban'` | `'lanes'` |

The parser is exported too — `parseTaskBoard`, `readyTasks`, `isReady`,
`findTask` — for a host that wants the model rather than the board.

## Stylesheet

```ts
import '@mdxstudio/tasks/styles.css';
```

Required, in addition to `@mdxstudio/react/styles.css`. Themed through the
`--mdxstudio-*` custom properties and `data-mdxstudio-theme`, light and dark.

ESM only, with TypeScript declarations.

## License

MIT
