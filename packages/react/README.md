# @mdxstudio/react

Renders an MDX string to React. `MdxRenderer` parses the document, evaluates its
expressions and mounts the result with a set of built-in components — callouts,
cards, stat grids, tabs, accordions, steps, timelines, badges and syntax-highlighted
code blocks — none of which the consuming app has to write.

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
`Tab`, `Accordion`, `Steps`, `Step`, `Timeline`, `ProgressBar`,
`InteractiveCounter`, `Kbd`, `Badge`, `Button`, `TableComponent`, `InlineCode`,
`MathExpression`).

ESM only, with TypeScript declarations.

## License

MIT
