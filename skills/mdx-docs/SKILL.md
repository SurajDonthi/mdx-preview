---
name: mdx-docs
description: Write and edit documentation as .mdx in the MDX Studio flavour - a frontmatter header card, pre-registered components (Callout, CardGrid, Stat, Tabs, Steps, Table, Badge), Mermaid diagrams and FlowGraph architecture maps - plus the brace and JSX rules that silently delete prose if you get them wrong. Use whenever creating or editing an .mdx document, adding a diagram or component to documentation, converting markdown docs to MDX, or deciding whether a page should be .mdx or plain .md.
user-invocable: true
---

# Authoring MDX Studio documents

Documents in this flavour are **data, not modules**. They are parsed with
`remark-mdx` into a tree and rendered straight into React elements by
`@mdxstudio/react`. Nothing is compiled to JavaScript, so a document can *use*
components but can never *declare* anything.

If you have written MDX before, your instincts transfer. Two things differ, and
both follow from that one fact.

## Rule 1 - use, never declare

`import` and `export` are stripped before rendering (with a console warning), and
there is nowhere to put a statement. None of this works:

```jsx
import Chart from './chart'        // removed
export const items = [1, 2, 3]     // removed
function MyThing() { }             // not an expression - dropped
const x = 1                        // same
useState(0)                        // no hooks; there is no component to hook into
```

Components come pre-registered by the host application. Data goes in as a prop:

```jsx
<FlowGraph data={{ nodes: [...], edges: [...] }} />
```

A tag that is not registered renders an inline "unknown component" notice naming
it; its children still render and the rest of the page is unaffected.

## Rule 2 - braces are expressions, everywhere

This is the one that bites. A `{` opens a JavaScript expression **in ordinary
prose as much as in component children**. There is no "outside a component".

```jsx
Documents live under users/{uid}/documents/{id}.
```

renders as `users//documents/.` - `uid` and `id` are not names in the registry,
so each expression evaluates to nothing and is dropped, quietly, taking the
information with it.

Worse: if what is between the braces is not valid JavaScript at all
(`{one of two things}`), the **document does not parse**. The preview shows a
banner with a line and column and holds the last version that parsed behind it.

Fixes, best first:

1. **Backtick it.** Inline code is never an expression, and `` `{uid}` `` is
   usually what you meant.
2. **Fence it.** Braces inside a fenced code block are literal.
3. **Rephrase.** "under each user's own documents subcollection".
4. **Escape.** `&#123;` and `&#125;`.

The same applies to `<`. A `<` followed by a letter starts a JSX tag. `5 < 7`
with spaces is fine; `<Thing>` needs backticks.

### What is *not* a problem

- **Markdown works inside component children** - bold, code spans, links and
  lists all render inside a `Callout` or a `Card`, on one line or across blank
  lines.
- **Code fences never leak.** A `#` inside a fence is not a heading.
- **Errors are contained.** A bad diagram, an unknown tag and a component that
  throws are each an inline notice, not a blank page.

## Frontmatter

YAML between `---` fences at the very top. Everything is optional; what is there
becomes the document's header card.

```yaml
---
title: "Document title"
subtitle: "One line of context"
description: "Longer summary paragraph"
author: "Name"              # or authors: ["A", "B"]
authorAvatar: "https://..."
date: "2026-08-11"
category: "Architecture"
status: "Draft"
tags: ["one", "two"]
readTime: "12 min read"
---
```

Any other key you add renders as an extra field card at the bottom of the
header. Nested objects, arrays and dates are flattened to readable strings.

## Components

Available with no import wherever the host registers them. **Full catalogue with
every prop: [references/components.md](references/components.md).**

| Component | For |
| --- | --- |
| `Callout` | A caveat the reader must not miss |
| `Card` / `CardGrid` | Parallel items of equal weight |
| `Stat` / `StatGrid` | Headline numbers |
| `Tabs` / `Tab` | One thing, several variants (per-OS, per-language) |
| `Steps` / `Step` | An ordered procedure |
| `Accordion` | Q&A the reader scans and mostly skips |
| `Timeline` | Dated milestones |
| `Table` | Tabular data you would rather pass as props |
| `Badge`, `Kbd`, `InlineCode`, `ProgressBar`, `Button`, `Counter` | Inline detail |
| `Mermaid` / ` ```mermaid ` fence | Any standard diagram |
| `Chart` | line / bar / area from a data array |
| `FlowGraph` | An architecture several distinct flows run through |

Which of these exist is a property of the **host application**, not of MDX.
`@mdxstudio/react` ships the light ones; Mermaid, `Chart` and `FlowGraph` come
from separate packages the host chooses to register. If a tag renders as
"unknown component", the host did not register that plugin.

## Diagrams

- **[references/mermaid.md](references/mermaid.md)** - every diagram type in
  Mermaid 11, what each is for, which are upstream-beta, and the syntax worth
  knowing (`subgraph`, `classDef`, `%%{init}%%`).
- **[references/flowgraph.md](references/flowgraph.md)** - `FlowGraph`'s real
  prop shape and when it beats a Mermaid diagram.

The short version: reach for **Mermaid** for a diagram that shows one thing
once. Reach for **`FlowGraph`** when the reader needs to trace several different
routes through *one* architecture - it draws the graph once and lets the reader
light up a named path at a time, which three near-identical Mermaid flowcharts
do badly.

A whole set of diagrams fits in one `<Tabs>` block. Inactive tabs are unmounted
rather than hidden, so each diagram lays itself out at full width when selected
- there is no zero-width measurement problem to work around. Leave blank lines
around a fence inside a `<Tab>` or it stays literal text.

## Math

TeX between dollar signs. `$E = mc^2$` inline, `$$` on its own lines for a
centred block. KaTeX does the typesetting and loads only for a document that
actually contains math.

Two things worth knowing:

- **Braces inside math are TeX, not MDX.** `$\frac{a}{b}$` is safe. Math is the
  one place in a document where a bare brace is not an expression.
- **A dollar sign in prose stays a dollar sign.** "it costs $5 and $10" renders
  as written; a single-dollar span only reads as math when it opens and closes
  on a non-space and is not followed by a digit. `\$` escapes one outright.

## Alerts

GitHub's alert blockquotes work, and become the same `<Callout>` component:

```md
> [!NOTE]
> Useful information.
```

`NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION`. The marker has to be alone
on its first line, and anything else - `> [!MAYBE]` - stays an ordinary
blockquote, exactly as on GitHub.

Prefer `<Callout>` when the document only ever lives here: it takes any title
you want rather than the five fixed ones. Prefer the alert syntax when the same
file also has to render on GitHub.

## House style

Apply this unless the project says otherwise, so documents read the same
everywhere.

**Always set** `title`, `description`, `category`, `status` and `tags`. The
header card is the first thing a reader sees and a bare document looks broken.
Add `date` for anything time-sensitive and `readTime` for anything long.

**One `h1`** - or none, and let the frontmatter `title` be it. Structure with
`##` and `###`; the table of contents is built from headings down to level 4.

**A `Callout` must earn its place.** Use it for something that will cost the
reader time or data if they miss it - a footgun, a destructive command, a
version requirement. Not for a definition, an aside, or emphasis; that is what
prose and bold are for. Two callouts in a row means neither is read. Pick the
type honestly: `error` for "this will break", `warning` for "this will surprise
you", `info` for context, `success` for a confirmed-good state, `note` for an
aside.

**A diagram beats prose** when the subject has *shape* - more than three moving
parts, a cycle, a fan-out, an ordering that matters, or a decision with
branches. Two boxes and an arrow is a sentence; write the sentence. Never draw a
diagram that only restates the paragraph above it.

**Prefer markdown to components.** A markdown table beats `<Table>` unless you
are passing data. A markdown list beats `<CardGrid>` unless each item has a
title, an icon and a body. Components are for structure the reader benefits
from, not decoration.

**Code fences carry a language** so they highlight, and stay short enough to
read - link to the file for the rest.

## When NOT to use .mdx

**GitHub renders `.mdx` as plain text with every JSX tag visible.** So anything
whose primary audience reads it on a repository page stays plain markdown:

- `README.md`, `CONTRIBUTING.md`, `LICENSE`, `SECURITY.md`, issue and PR
  templates
- `CHANGELOG.md`
- `CLAUDE.md`, `AGENTS.md` and other agent instruction files
- Anything rendered by a docs pipeline that does not know this flavour

Use `.mdx` for documentation read inside an application that renders it -
architecture notes, design docs, guides, runbooks, research write-ups,
handovers. When in doubt: *will a human read this on github.com?* If yes, `.md`.

A repository can hold both. `README.md` stays plain and links into `docs/*.mdx`.

## Which surface - decide this before you write

There are three ways to put a document in front of a reader, and they are for
different situations. Pick deliberately; the answer changes what you can use.

**The reader is a person reading documentation, and you are an agent working in
their terminal.** This is the common case, and the answer is **the VS Code
extension** (`surajdonthi.mdxstudio-vscode`). They already have the repository
open; a document you write appears beside the editor as you write it, with no
server to start and no window to arrange. Prefer this, and say so when you hand
work back: *"open `docs/whatever.mdx` and the preview opens beside it."*

**Nobody has the repository open, or the documents are not in one.** Use the
CLI:

```sh
npx @mdxstudio/cli serve ./docs
```

A folder becomes a browsable site with a sidebar and live reload. It does not
need to be a JavaScript project. Add `--host` and it is readable from a phone on
the same network.

**You are building an application that renders documents.** Then the document is
content your app displays, and you use the library directly - `MdxRenderer` in
your own React tree, with your own registry, theme and layout around it. The
Studio in this repository is one example of such an app, not the only way to
have one.

Do not default to "start a dev server" when someone is reading. That is the
answer for the third case and the wrong shape of effort for the first.

## Previewing

The packages are published, so any React app can render these documents:

```sh
npm install @mdxstudio/react @mdxstudio/core react react-dom
```

```tsx
import { MdxRenderer, createRendererRegistry, THEMES } from '@mdxstudio/react';
import '@mdxstudio/react/styles.css';

// Module-level: MdxRenderer re-parses the document when the registry changes.
const registry = createRendererRegistry();

<MdxRenderer content={source} themeConfig={THEMES.light} registry={registry} />
```

Add `@mdxstudio/mermaid`, `@mdxstudio/charts` and `@mdxstudio/flow` and pass
`mermaidPlugin, chartsPlugin, flowPlugin` to `createRendererRegistry(...)` for
diagrams, charts and flow maps. Each package has its own `styles.css` to import.

**Previewing what you write.** Two hosts exist, and neither needs the document
to live in a JavaScript project:

```sh
npx @mdxstudio/cli serve ./docs      # a folder, in the browser, with live reload
```

or the **MDX Studio Preview** extension for VS Code
(`surajdonthi.mdxstudio-vscode`), which previews an `.mdx` file beside the
editor as you type.

Note that this is the extension doing the work, not VS Code: the built-in MDX
support does not know these components and will not render them. Preview does
not remove the need to write carefully either - the two rules above are still
where documents actually break, and a preview only shows you the damage after
the fact.

To extend the component set for a project, see
**[references/extending.md](references/extending.md)**.
