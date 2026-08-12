# @mdxstudio/react

Renders an MDX string to React. `MdxRenderer` parses the document, evaluates its
expressions and mounts the result with a set of built-in components — callouts,
cards, stat grids, tabs, accordions, side-by-side splits, steps, timelines, badges
and syntax-highlighted code blocks — none of which the consuming app has to write.

## Install

```sh
npm install @mdxstudio/react @mdxstudio/core react
```

`@mdxstudio/core` and `react` are peer dependencies. npm 7+ installs peers for you;
pnpm and yarn need them listed explicitly.

| Peer            | Range      | Why                                                          |
| --------------- | ---------- | ------------------------------------------------------------ |
| `react`         | `^19.0.0`  | One React instance, or hooks throw.                          |
| `@mdxstudio/core`  | `^0.1.0`   | Holds the render context every mdxstudio package reads from — a second copy silently breaks theming inside diagrams and charts. |

## Usage

```tsx
import { MdxRenderer, THEMES } from '@mdxstudio/react';
import '@mdxstudio/react/styles.css';

const source = `---
title: Release notes
author: Ada
---

# Hello

<Callout type="info" title="Heads up">
  Components are available without importing them.
</Callout>

<StatGrid cols={2}>
  <Stat title="Uptime" value="99.98%" change="+0.02%" trend="up" />
  <Stat title="p95 latency" value="120ms" trend="neutral" />
</StatGrid>

\`\`\`ts
export const answer = 42;
\`\`\`
`;

export function Doc() {
  return <MdxRenderer content={source} themeConfig={THEMES['github-light']} />;
}
```

`themeConfig` is required. `THEMES` is keyed by `ThemeId`: `frosted-glass`,
`github-light`, `github-dark`, `dracula`, `nord`, `editorial`, `cyberpunk`,
`forest`.

### Stylesheet

```ts
import '@mdxstudio/react/styles.css';
```

Plain CSS — no Tailwind, no preprocessor, no build step. Import it once, anywhere
in your app. The theme is applied through CSS custom properties that `MdxRenderer`
sets from `themeConfig`, so one stylesheet covers every theme.

### Adding components

`MdxRenderer` only knows its own components by default. Diagrams, charts and flow
graphs ship separately so their weight is opt-in:

```ts
// mdxRegistry.ts — module scope, so the object identity is stable.
import { createRendererRegistry } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';

export const registry = createRendererRegistry(mermaidPlugin, chartsPlugin);
```

```tsx
<MdxRenderer content={source} themeConfig={THEMES['nord']} registry={registry} />
```

Passing a component under a built-in name replaces it. Build the registry once at
module scope: a new registry object on every render re-parses the document.

That is how *your application* gets your components. A reader who is not running
your application — someone browsing the repository with
`npx @mdxstudio/cli serve ./docs`, or previewing a file in VS Code with the *MDX
Studio Preview* extension — reaches the same components through an
`mdxstudio.config.js` in the folder, whose default export those two hosts turn
into a registry source and apply after their own built-ins:

```js
// mdxstudio.config.js
export default ({ createElement }) => ({
  components: { Ticket: ({ id }) => createElement('code', null, `#${id}`) },
  aliases: { Issue: 'Ticket' },
});
```

It runs in the browser, so `createElement` rather than JSX and no bare imports.
The extension will not load one in a workspace you have not trusted.

### Math

`$inline$` and `$$block$$` are typeset with KaTeX. Nothing to register and
nothing to import: the parser turns math into `<MathExpression>`, which loads
KaTeX and its stylesheet on demand, so a document with no equations downloads
neither. Until the chunk arrives the TeX source is what is on the page.

`katex` is a dependency of this package; if your bundler needs help with the
`katex/dist/katex.min.css` import inside the lazy chunk, alias it — the CLI does
exactly that in `packages/cli/scripts/build-client.mjs`.

### Alerts

GitHub's alert blockquotes render through the built-in `Callout`, so they are
themed by the same `--mdxstudio-callout-*` properties:

```md
> [!WARNING]
> Mind the gap.
```

### Headings

`h1` to `h3` each open a section a reader can collapse: everything under the
heading, down to the next heading of the same level or a shallower one, folds
away behind a chevron in the heading itself. `h4` to `h6` get no chevron of their
own — they label a paragraph rather than start a chapter — and fold away with the
section they sit in. Everything starts open, and a heading with nothing under it
gets no chevron at all.

The chevron is the only thing that opens and closes a section, so selecting a
sentence out of a heading never folds the text under it away. It is a real
button: `aria-expanded`, `aria-controls`, Enter and Space. A collapsed section's
content is unmounted rather than hidden, so a heading inside it stops answering
`document.getElementById` — which is what stops a table of contents or an editor
scroll sync from measuring a heading that is not on the page.

Beside it is a copy control, which puts the heading's fragment on the clipboard —
`#the-heading` — and nothing else. That is the one form that means the same thing
in every host: pasted into a document it is a working in-page link, and given a
path in front of it, the cross-document link the VS Code extension resolves
(`./other.mdx#the-heading`). A full URL would be a `vscode-webview://` address or
a port on somebody's laptop, neither of which survives being shared. The ids are
the ones `extractHeadings()` reports, so a copied link and a table of contents
entry cannot disagree.

The heading itself is untouched: a real `h1`, `h2` or `h3`, with its id, in
document order, and with only its own text in it. In `renderMode="pdf"` every
section is open and neither control is rendered, so nothing is lost to the
exporter.

### Accordions

Panels are children, so anything a document can hold goes inside one — lists,
fenced code, other components, a diagram:

```mdx
<Accordion>

<AccordionItem title="How does parsing work?" icon="BookOpen" badge="New">

Full **markdown** here, because the panel goes through the MDX pipeline.

- a list
- another item

</AccordionItem>

<AccordionItem title="What about a diagram?" subtitle="Yes, that too">
  Anything at all.
</AccordionItem>

</Accordion>
```

Markdown inside a panel needs a blank line after the opening tag and before the
closing one — that is MDX, not this component. Panels written compactly on one
line each still group correctly; only the markdown in them stays literal.

`AccordionItem` takes `title` plus the same optional `icon` (a lucide name),
`subtitle` and `badge` that `Card` does, and `defaultOpen`.

The accordion itself takes `multiple`, which lets more than one panel be open at
once, and `defaultOpen`, which decides what is open on load: an index, a title,
`"all"`, `"none"`, or a list of those. Given neither, the panels marked
`defaultOpen` open, and if none are, the first one does — an accordion arrives
with something to read. `<Accordion defaultOpen="none">` starts shut.

The trigger is a real button: `aria-expanded`, `aria-controls`, Enter and Space
to open and close, Up/Down/Home/End to move between panels. A closed panel stays
mounted and `hidden`, so a component inside it keeps its state.

In `renderMode="pdf"` every panel is open and the trigger is not a button, so
nothing is lost to the exporter — which deletes every button and photographs
only what is visible.

The 0.2.3 prop form still renders, and reads the same extra fields:

```jsx
<Accordion items={[{ title: 'Question?', content: 'Answer.' }]} />
```

`content` is a prop, so markdown written there stays literal. Children win when
a document gives both.

### Splits

Two things on the page at once — the one thing `Tabs` cannot do, because a tab
shows one variant at a time and a comparison needs both together. Pane content
is children, so anything a document can hold goes in one: fences, lists, other
components, a diagram.

````mdx
<Split ratio="60/40">

<Pane title="Before" icon="Ban">

```ts
const x = 1;
```

</Pane>

<Pane title="After" icon="Check" badge="Typed">

```ts
const x: number = 1;
```

</Pane>

</Split>
````

`direction` says how the *panes* are arranged: `row` (the default) puts them
beside each other, `column` stacks them. It deliberately does not take
`horizontal` or `vertical` — those name the divider to some readers and the
arrangement to others. The divider's own axis is the opposite one, and is
reported where it matters: `aria-orientation` is `vertical` for a row of panes
and `horizontal` for a column of them.

`ratio` sets where the split starts. A list of weights spelled any of the usual
ways — `"60/40"`, `"2:1"`, `"3 1"`, `{[3, 1]}` — or a single number, which is
the first pane's percentage. Anything unreadable gives equal panes, and no pane
is ever narrower than 10%. More than two panes work; each divider moves only the
two panes it sits between.

Dragging a divider changes the split for the session only — nothing is stored,
and a reload is back to what the document said. The divider is focusable:
arrow keys move it by 2%, Shift by 10%, Home (or a double-click) puts the
authored ratio back.

`height` gives the split a fixed size, and its panes scroll instead of growing.
A column split needs one for its divider to have anything to move, so it takes
`24rem` unless told otherwise; a row split grows with its content by default.

`Pane` takes `title`, plus the same optional `icon` (a lucide name) and `badge`
that `Card` does. `Compare` is another name for `Split`.

Below 48rem a row of panes stacks, because two fences side by side in a narrow
column are unreadable, and the divider goes with it — there is nothing left for
it to move.

In `renderMode="pdf"` the layout is decided against the A4 sheet rather than
against the reader's window. Two panes print side by side down to 60/40; a
three-way split, or anything more lopsided, is stacked instead, each pane at
full width under its own title — and a pane that never named itself is numbered,
so a stacked export is never a column of unlabelled content. The divider is
still drawn but is not a button, so the exporter has nothing to delete.

### Images

Clicking an image opens it enlarged over the document; Escape, the close button
or a click outside closes it, and focus returns to the image, which is itself
focusable and answers Enter and Space. Turn it off with `lightbox={false}`; it
is off automatically in `renderMode="pdf"`.

### Untrusted documents

`expressions="literals"` restricts `{...}` to values the syntax spells out. For a
document you did not write, that is not enough on its own — the components
themselves still run in your page. Use [`@mdxstudio/sandbox`](https://github.com/SurajDonthi/mdx-preview/tree/main/packages/sandbox#readme).

## Exports

`MdxRenderer`, `FrontmatterHeader`, `InlineToken`, `MdxImage`, `ImageLightbox`,
`THEMES`, `reactPlugin`, `createRendererRegistry`, `baseMdxRegistry`, and every
built-in component (`Callout`, `Card`, `CardGrid`, `Stat`, `StatGrid`, `Tabs`,
`Tab`, `Accordion`, `AccordionItem`, `Split`, `Pane`, `Steps`, `Step`,
`Timeline`, `ProgressBar`, `InteractiveCounter`, `Kbd`, `Badge`, `Button`,
`TableComponent`, `InlineCode`, `MathExpression`).

ESM only, with TypeScript declarations.

## License

MIT
