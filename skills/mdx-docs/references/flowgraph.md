# FlowGraph

An interactive architecture map: nodes grouped into horizontal bands, edges
between them, and a **flows panel** that lights up one complete named path
through the graph at a time. Registered by `@mdxstudio/flow`; also answers to
`ArchitectureMap`.

Source of truth: `packages/flow/src/FlowGraph.tsx`.

## When it beats a Mermaid diagram

Use a Mermaid flowchart when the diagram shows **one thing once**. It is
cheaper, everyone can read the source, and it renders anywhere.

Use `FlowGraph` when **the reader needs to trace several different routes
through one architecture**. Say the same six services handle a save, a sync and
a cold start. Three Mermaid flowcharts means drawing the same boxes three times:
the reader has to re-orient at each one, and the three drift apart the moment
someone edits only one. `FlowGraph` draws the topology once and treats each
route as a *selectable overlay* - the reader holds one mental map and switches
which path is highlighted.

The heuristic: **shared nodes, different paths → `FlowGraph`. Different nodes →
separate Mermaid diagrams.**

It is also the better choice when nodes need hover detail (the `description`
prop becomes a tooltip) or when you want the bands of a layered architecture
drawn explicitly rather than inferred.

Do not use it for a sequence, a state machine, a schema or anything dated -
Mermaid has purpose-built types for those.

## Shape

Everything can be passed as top-level props or bundled into `data`. `data` is
usually tidier and keeps braces off the prose.

```jsx
<FlowGraph
  title="Document lifecycle"
  subtitle="How a keystroke becomes a rendered page"
  defaultFlow="save"
  data={{
    groups: [
      { id: "ui", label: "Interface" },
      { id: "core", label: "Core" }
    ],
    nodes: [
      { id: "editor", label: "Editor", group: "ui", kind: "ui",
        meta: "MdxEditor.tsx", description: "Shown on hover or keyboard focus." },
      { id: "parser", label: "Parser", group: "core", kind: "module" },
      { id: "store",  label: "IndexedDB", kind: "store" }
    ],
    edges: [
      { from: "editor", to: "parser", label: "source" },
      { from: "parser", to: "store",  label: "cache", kind: "dashed" }
    ],
    flows: [
      { id: "save", label: "Save", tone: "indigo",
        summary: "What happens when the user stops typing.",
        path: ["editor", "parser", "store"] }
    ]
  }}
/>
```

### Props

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | string | Card heading |
| `subtitle` | string | Second line |
| `data` | object | `{ nodes, edges, groups, flows }` - same keys as the top-level props |
| `nodes` `edges` `groups` `flows` | arrays | Top-level alternative to `data`; these win if both are given |
| `defaultFlow` | string | Flow `id` **or** `label` selected on first render |
| `className` | string | Extra class on the card |

### Node

`{ id, label?, meta?, group?, description?, kind? }`

- `id` is required and must be unique; a duplicate or empty id is dropped.
  `key` and `name` are accepted as aliases for `id`.
- `label` defaults to the id. `title` and `name` are accepted aliases.
- `meta` - small second line under the label (a file name, a type, a count).
  `subtitle` is an alias.
- `group` - which band the node sits in. `band` and `layer` are aliases.
- `description` - tooltip body, shown on hover or keyboard focus. `detail` and
  `tooltip` are aliases.
- `kind` - visual accent, lower-cased: `ui` · `component` · `state` · `module` ·
  `service` · `external` · `store` · `decision` · `risk`. `external` and `store`
  are drawn with a dashed outline. `type` is an alias.

A bare string in `nodes` is shorthand for `{ id: s, label: s }`.

### Edge

`{ from, to, label?, kind? }` - `source`/`target` and `a`/`b` are accepted
instead of `from`/`to`.

Also accepted, anywhere edges are taken:

- `"editor->parser"` (any number of dashes, and `→` works)
- `["editor", "parser"]`, optionally `["editor", "parser", "label"]`

`kind: "dashed"` (or `"async"`, or `dashed: true`) draws a dashed line - use it
for derived, cached or return paths.

### Group

`{ id, label?, description? }`. Groups are horizontal bands drawn top to bottom
in the order given. Omit `groups` entirely and the layering is derived from the
edges. A bare string is shorthand for an id.

### Flow

`{ id?, label?, summary?, path?, nodes?, edges?, tone? }`

- `path` - ordered node ids. Consecutive pairs light up **when they are real
  edges**; a pair that is not an edge in either direction is silently skipped,
  so a path through a node you forgot to wire up will look broken.
- `nodes` - extra node ids that belong to the flow but are not on the ordered
  path.
- `edges` - extra edges, in any of the edge forms above.
- `summary` - one line shown when the flow is selected. `description` is an
  alias.
- `tone` - `indigo` · `emerald` · `amber` · `violet` · `cyan` · `sky` · `rose` ·
  `fuchsia` · `slate`. Omit it and flows are assigned tones in order (`slate` is
  not in the automatic rotation).

## Behaviour worth knowing

- **Malformed input is dropped, never thrown.** An edge naming a node that does
  not exist simply does not appear; so does a self-edge and a duplicate edge in
  the same direction. This makes typos invisible - check that the diagram shows
  everything you wrote.
- **Bidirectional pairs are pulled apart** so the two lines do not overdraw.
- **Below about 760px of container width** the flows panel stacks under the
  diagram instead of sitting beside it.
- **In PDF export it renders static**: no selection, no tooltips, and every flow
  is listed with its summary and its path written out in full. Write `summary`
  and `path` for every flow if the document will be exported.
- Node hover state is also pinnable by click, so a reader can keep one
  description open.

## House rules

- **Fewer than five nodes does not need this.** Write the sentence, or draw a
  Mermaid flowchart.
- **Name the groups after the layer, not the technology** - "Storage", not
  "IndexedDB"; the node carries the technology in `meta`.
- **Give every flow a `summary`.** It is the only prose the panel shows and the
  only thing that survives to PDF.
- **Set `defaultFlow`** to the most common path, so the diagram opens meaning
  something rather than as an undifferentiated web.
- **Put the whole thing in `data={{ ... }}`** rather than four sibling props. It
  keeps the JSX readable and there is exactly one brace to get right.
