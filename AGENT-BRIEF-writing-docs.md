# Brief: writing documentation in MDX Studio

You are writing `.mdx` documents that will be rendered by **MDX Studio**, a browser-based
MDX viewer with a batteries-included component library. You know nothing about this
project; everything you need is below.

Your documents will be read *inside the app*, not on GitHub. Use the components — a
document that is only prose and code fences is wasting the medium.

---

## 1. What you are writing against

Documents are parsed with **`remark-mdx`** (the real MDX parser) and rendered straight to
React. Standard MDX syntax applies: GFM markdown, plus JSX components, plus `{expression}`
blocks.

Two consequences that differ from a normal MDX toolchain:

- **There is no build step and no module system.** You cannot `import` anything. Components
  are pre-registered and available by name with no import line. `import`/`export`
  statements are skipped with a warning.
- **A document cannot declare things.** No `const`, no functions, no hooks. The document
  body is rendered, not executed as a module. Anything stateful must come from a component.

---

## 2. Rules that will bite you

**Markdown stops inside JSX children.** Between `<Callout>` and `</Callout>`, `**bold**` and
`` `code` `` still work (children are parsed as markdown), but block-level markdown like
lists and headings behave inconsistently. For anything structural inside a component, use
HTML elements — `<p>`, `<ul>`, `<li>`, `<strong>`, `<code>`.

**Braces in prose are expressions.** Inside JSX children, `{uid}` is evaluated as a
variable, not printed as text. It will fail, log a warning, and render nothing where you
expected text. It no longer destroys the whole document — an earlier version did — but your
sentence still comes out wrong. Rephrase, escape as `&#123;`, or write it as a string:
`{"users/{uid}/docs"}`.

**Code fences are safe.** Anything inside triple-backtick fences or single-backtick spans is
literal. Component examples belong there.

**A document must be valid MDX.** An unclosed tag freezes the preview at the last good
render and shows a banner with the line and column. It does not silently swallow content.

---

## 3. Frontmatter

YAML at the very top, between `---` fences. All optional. It renders as a header card.

```yaml
---
title: "Document title"
subtitle: "One line under the title"
description: "A paragraph of summary"
author: "Name"
date: "2026-08-07"
category: "Guide"
status: "Current"
tags: ["one", "two"]
readTime: "8 min read"
---
```

Any key not in that list renders as an extra field card. Nested objects and arrays are
flattened to readable strings.

---

## 4. Components available

No imports needed. These are registered globally.

### Callout — for genuine warnings, not decoration

```jsx
<Callout type="warning" title="Rules do not cascade">
  A rule matching only the user record leaves every document read denied.
</Callout>
```

`type`: `info` · `warning` · `success` · `error`

### Cards

```jsx
<CardGrid cols={2}>
  <Card title="Live preview" subtitle="Instant" icon="Eye" badge="New">
    <p>Body text.</p>
  </Card>
</CardGrid>
```

`icon` takes any [lucide](https://lucide.dev/icons) name.

### Stats

```jsx
<StatGrid cols={3}>
  <Stat title="Total Visitors" value="124,850" change="+18.4%" trend="up" icon="Users" />
</StatGrid>
```

### Tabs, Accordion, Timeline, Steps

```jsx
<Tabs labels={["Overview", "Detail"]}>
  <Tab title="Overview"><p>First panel.</p></Tab>
  <Tab title="Detail"><p>Second panel.</p></Tab>
</Tabs>

<Accordion items={[{ title: "Question?", content: "Answer." }]} />

<Timeline items={[{ date: "Q1 2026", title: "Milestone", description: "...", icon: "Rocket" }]} />

<Steps>
  <Step number={1} title="First">Do this.</Step>
</Steps>
```

### Inline

`<Badge>`, `<Kbd>`, `<InlineCode>` (alias `<Code>`), `<Button>`,
`<ProgressBar progress={82} label="Deploying" color="emerald" />`,
`<InteractiveCounter initial={42} min={0} max={100} step={5} />` (alias `<Counter>`),
`<Table>` (alias `<CustomTable>`).

### Diagrams — Mermaid

Two ways in. A fenced ` ```mermaid ` block, or the component:

```jsx
<Mermaid chart={`flowchart LR
    A["Start"] --> B["End"]`} />
```

Use the fence for a plain diagram; use the component when you need it inside another
component (a `<Tab>`, a `<Card>`). Alias: `<MermaidDiagram>`.

Invalid syntax renders an inline error card naming the problem — it does not break the page,
so a diagram you are unsure about is safe to try.

**This is Mermaid 11. Everything the upstream language supports is available.** Reach past
flowcharts — most of these are underused and carry information prose cannot:

| Diagram | `mermaid` keyword | Use it for |
|---|---|---|
| Flowchart | `flowchart` / `graph` | control flow, decisions, pipelines |
| Sequence | `sequenceDiagram` | who calls whom, in what order, over time |
| Class | `classDiagram` | type relationships, inheritance, interfaces |
| State | `stateDiagram-v2` | lifecycles, status machines, retry logic |
| Entity relationship | `erDiagram` | data models, foreign keys, cardinality |
| Gantt | `gantt` | schedules, rollout plans, phases |
| Pie | `pie` | proportions — sparingly |
| Quadrant | `quadrantChart` | prioritisation, effort vs impact |
| Requirement | `requirementDiagram` | traceability from requirement to design |
| Git graph | `gitGraph` | branching and release strategy |
| C4 | `C4Context` / `C4Container` | system context and container boundaries |
| Mindmap | `mindmap` | taxonomies, brainstorm structure |
| Timeline | `timeline` | chronology (distinct from the `<Timeline>` component) |
| Sankey | `sankey-beta` | flow volumes, conversion funnels, where things go |
| XY chart | `xychart-beta` | trends where you want a chart without data plumbing |
| Block | `block-beta` | layered architecture, memory or layout maps |
| Packet | `packet-beta` | binary/wire formats, byte layouts |
| Architecture | `architecture-beta` | cloud topology with service icons |
| Kanban | `kanban` | work state on a board |
| Radar | `radar-beta` | multi-axis comparison |
| Treemap | `treemap-beta` | nested proportions, bundle or disk composition |
| Journey | `journey` | user journeys with satisfaction scores |

Anything marked `-beta` is upstream-experimental; syntax may change between Mermaid
releases. It renders today — just check it rather than assuming.

Useful within any of them: `subgraph` for grouping, `classDef` + `class` for colouring a
path, `%%{init: {...}}%%` front-matter for per-diagram theming, `click` for links, `note`
in sequence diagrams, `-->` versus `-.->` versus `==>` for edge weight.

Two practical notes for this app:

- Diagrams render asynchronously and expose `data-render-state` as `rendering` → `ready`
  or `error`. PDF export waits for `ready` and refuses to export a document with a failed
  diagram, so a broken diagram blocks the whole export — worth checking before handing a
  document over.
- Long labels do not wrap. Keep node text short and put the detail in prose, or the diagram
  will be wider than the page on a phone.

**Choosing between Mermaid and `<FlowGraph>`:** Mermaid is better for anything with real
diagram semantics — sequence, state, ER, gantt. `<FlowGraph>` is better for a system map
you want the reader to *explore*, because it highlights complete paths on click and carries
per-node descriptions. If the reader needs to trace several routes through one architecture,
use `<FlowGraph>`; otherwise use Mermaid.

### Charts

```jsx
<Chart type="area" title="Growth"
  data={[{ name: 'Jan', value: 1200 }, { name: 'Feb', value: 1900 }]} />
```

`type`: `area` · `line` · `bar` · `pie`

### FlowGraph — the distinctive one

An interactive architecture diagram: nodes, edges, and a flows panel. Selecting a flow
highlights its complete path and dims everything else. Nodes show a description on hover
and on keyboard focus. Use it wherever you would otherwise draw a system diagram.

```jsx
<FlowGraph
  title="Optional title"
  data={{
    groups: [{ id: "ui", label: "Components" }],
    nodes: [
      { id: "A", label: "Editor", group: "ui", kind: "ui", description: "Shown on hover." },
      { id: "B", label: "Store", kind: "store" }
    ],
    edges: [{ from: "A", to: "B", label: "writes" }],
    flows: [{ id: "save", label: "Save", summary: "What happens.", path: ["A", "B"] }]
  }}
/>
```

- `kind`: `ui` · `state` · `module` · `external` · `store` · `decision` · `risk`
- `groups` are horizontal bands; omit them and layers are derived from the edges
- edges also accept `"A->B"` or `["A", "B"]`
- narrow screens stack the panel under the diagram; PDF export renders it static with every
  flow path written out

---

## 5. Expressions

Expressions work with real JavaScript semantics, in attributes and in the document body:

```mdx
{items.filter((i) => i.score > 0.8).map((i) => <Badge key={i.id}>{i.name}</Badge>)}
```

Remember there are no variables to reference — you have no scope of your own, so in practice
this means literals you write inline. Attribute expressions are the common case:
`data={{ ... }}`, `cols={3}`, `items={[...]}`.

If an expression fails it is dropped with a console warning and the rest of the document
renders.

---

## 6. Extending — adding your own components

If a document needs something that does not exist, it is added in code, not in the document.

Components are supplied by a **registry** composed from plugins:

```ts
import { defineMdxPlugin, createMdxRegistry } from '@mdxkit/core';

export const myPlugin = defineMdxPlugin({
  name: 'my-app/components',
  components: { PricingTable, ApiEndpoint },
  aliases: { Endpoint: 'ApiEndpoint' },      // extra tag names
  codeFences: { sql: 'SqlBlock' },           // claim ```sql fences
});

const registry = createMdxRegistry(reactPlugin, myPlugin);
```

Later sources win, so an app can override a component a package shipped. `codeFences` lets a
plugin take over a fenced language — that is how ` ```mermaid ` becomes a diagram.

Point this out in documentation you write: authors extend by registering a plugin, never by
importing inside a document.

---

## 7. How to write well here

- **Lead with the conclusion.** Say what is true, then why.
- **Anchor claims to real locations** — `file.ts:120`, not "the parser".
- **Reach for a component when it carries information a paragraph cannot.** A FlowGraph for
  a system with more than three moving parts. A Callout for something that will actually
  cost the reader time. Tabs for genuine alternatives. Do not decorate.
- **Explain why, not just what.** The reasoning is the part a reader cannot recover from
  the code.
- **No marketing.** No "powerful", "seamless", "robust".
- Prefer prose to bullet soup. Bullets are for genuine lists.

---

## 8. Verify before you hand anything over

A document that fails to render is worse than no document. Load each one in the app and
confirm:

- no **"Fallback View Active"** banner
- no **"MDX JSX Warning"** or `MDX: Line …` parse banner
- no red dashed **unknown component** pills — that means you used a name that is not
  registered
- the components you used actually appear
- the console is clean

To load a document, write it into `localStorage` under `mdx_studio_documents_v1` as
`[{ id, title, content, updatedAt }]`, set `mdx_studio_active_doc_id` to its id, reload, and
click **Preview**.

---

## 9. Source of truth

If anything here disagrees with the code, the code wins. Check:

- `packages/react/src/CustomComponents.tsx` — every light component and the exact props
- `packages/core/src/registry.ts` — the plugin and registry API
- `packages/flow/src/FlowGraph.tsx` — full FlowGraph prop types
- `packages/react/src/MdxRenderer.tsx` — how documents are parsed and rendered
- `apps/studio/src/mdxRegistry.ts` — what this particular app registers
