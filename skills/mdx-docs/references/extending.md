# Extending the component set

A document can only use what the **host** registered. Adding a component is a
change to the host, never to the document - there is no `import` a document can
reach for.

"The host" is an application when you are building one. For the two hosts a
reader is more likely to be running - the CLI and the VS Code extension - it is
a file in the project: `mdxstudio.config.js`. Same registry, same plugin shape,
composed from a file instead of from code. **[How a reader actually sees your
component](#how-a-reader-actually-sees-your-component)** at the end of this file
covers all three; read it before you decide where to put anything.

Source of truth: `packages/core/src/registry.ts`, and
`packages/core/src/mdxConfig.ts` for the config file.

## The registry

A document is rendered against a flat `name -> component` map. The renderer
resolves every JSX tag through it and hands the same map to `{...}` expressions
as their scope. A tag that is not in the map renders an inline "unknown
component" notice naming it - the document keeps rendering.

```ts
import { createMdxRegistry } from '@mdxstudio/core';
import { reactPlugin } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';

export const registry = createMdxRegistry(reactPlugin, mermaidPlugin, {
  MyOwnComponent,   // a bare map, for one-off additions
});
```

`createRendererRegistry(...extras)` from `@mdxstudio/react` is the same thing
with `reactPlugin` already applied - use it unless you deliberately want the
built-ins gone.

**Sources apply in order and the last one wins**, so passing your own component
under a built-in name replaces it.

**Build the registry at module scope.** `MdxRenderer` re-parses the document
whenever the registry's identity changes, so a registry created inside a render
function re-parses on every keystroke.

## defineMdxPlugin

A plugin is a named bundle one package contributes. `defineMdxPlugin` only
brands the object so the registry can tell a plugin from a plain component map;
plugins stay plain data.

```ts
import { defineMdxPlugin } from '@mdxstudio/core';

export const myPlugin = defineMdxPlugin({
  name: '@acme/mdx-widgets',       // used in diagnostics only
  components: { PriceTable, Roadmap },
  aliases: { Prices: 'PriceTable' },
  codeFences: { csv: 'PriceTable' },
});
```

### `components`

`Record<string, ComponentType>`. The keys are the tag names documents write.
Capitalise them - a lowercase tag is treated as an HTML element, not a
component.

### `aliases`

`Record<aliasName, existingComponentName>`. Extra names for a component already
registered **by this plugin or by an earlier one**, which is how
`Mermaid → MermaidDiagram` and `ArchitectureMap → FlowGraph` work.

Aliases are resolved after every source has contributed, so a plugin may alias a
component another plugin provides. An alias pointing at a name nothing
registered **throws** at registry-construction time with a message naming the
plugin, the alias and the missing target - a build-time failure, not a
render-time surprise.

### `codeFences`

`Record<fenceLanguage, componentName>`. Claims a fenced code language. When a
document contains a ` ```csv ` fence the renderer mounts
`<PriceTable language="csv">{code}</PriceTable>` instead of syntax-highlighting
the block. Languages are matched case-insensitively.

This is exactly how ` ```mermaid ` works, and it is the nicest extension point
for anything whose source is plain text: the document author writes a fence, not
JSX, so there are no braces to escape and the raw source stays readable
everywhere else.

Same rule as aliases: a fence pointing at an unregistered component throws.

## The component contract

A registered component is an ordinary React component. Three things are worth
knowing:

- **Props arrive as written.** String attributes are strings; `{...}`
  attributes are the evaluated expression. Validate and clamp rather than
  trusting - the built-ins all fall back to a default rather than throwing on a
  bad `variant`.
- **Never throw for bad input.** A component that throws is caught by the
  renderer's error boundary and replaced by a banner, which is a worse outcome
  than dropping one malformed row. `FlowGraph` normalises everything and drops
  what it cannot understand; follow that.
- **Read the render context** for theme and export awareness:

  ```tsx
  import { useContext } from 'react';
  import { MdxRenderContext } from '@mdxstudio/core';

  const { renderMode, themeCategory } = useContext(MdxRenderContext);
  // renderMode: 'live' | 'pdf'   themeCategory: 'light' | 'dark'
  ```

  `renderMode === 'pdf'` means the tree is being rendered for export: drop
  interactivity, and render inline whatever a button would otherwise have
  revealed (the exporter strips every `button` element).

## How a reader actually sees your component

A registry only matters once something renders with it. There are three
deliveries, and the one you need depends on who is reading.

### 1. Your own application

Compose the registry in code and pass it to the renderer. This is the case the
sections above describe.

```tsx
// mdxRegistry.ts - module scope, so the identity is stable
export const registry = createRendererRegistry(mermaidPlugin, myPlugin);

// somewhere in the tree
<MdxRenderer content={source} themeConfig={theme} registry={registry} />
```

### 2. `npx @mdxstudio/cli serve ./docs`

Put an `mdxstudio.config.js` (or `.mjs`) in the folder being served. Its default
export is turned into one more registry source and applied after the CLI's own,
so it can add components or replace them.

### 3. The VS Code extension

Put the same file in the workspace folder. The extension finds
`mdxstudio.config.js` then `mdxstudio.config.mjs` in the workspace folder the
document belongs to - in a multi-root workspace, that folder only - and applies
it after its own built-ins, exactly as the CLI does. `mdxstudio.config` in
settings points somewhere else or turns it off with `off`.

**One file serves both.** Same two names, same default export, same argument:

```js
// mdxstudio.config.js, in the root of the repository
export default ({ React, createElement, components }) => ({
  components: {
    PriceTable: ({ rows }) => createElement('table', null, /* ... */),
  },
  aliases: { Prices: 'PriceTable' },
  codeFences: { csv: 'PriceTable' },
  remarkPlugins: [],
  rehypePlugins: [],
});
```

The default export is that object or a function returning one, which may be
`async`. Everything is optional. Four things follow from *where* it runs - in
the page, because that is where the renderer is:

- **No bare imports.** There is no `node_modules` in a browser. Import from a
  URL (`https://esm.sh/...`) if you need a package.
- **No JSX**, because nothing compiles the file. Use `createElement`; the
  function form is handed the page's own `React` and `createElement`, which is
  also the only React the component may use.
- `components` in the argument is everything already registered, so a config can
  wrap or replace a built-in rather than only adding to it.
- A remark or rehype plugin is a plain function and usually needs no dependency
  at all, so syntax-level extensions travel well here.

Nothing about the file is fatal. A missing default export, a throw on import, an
alias pointing at nothing: each becomes one line naming the file, and the
documents render with the host's built-ins regardless.

### The caveat that matters in VS Code

**A workspace you have not trusted loads no config at all.** The file is a
module of that repository's code and running it is what Restricted Mode exists
to prevent, so the setting cannot re-enable it - not even from the repository's
own `.vscode/settings.json`. The preview says so in a line at the top, naming the
file it skipped. Granting trust loads it immediately.

So when you hand work back to someone: if you added an `mdxstudio.config.js`,
tell them to trust the workspace, or their components will render as "unknown
component" notices and they will assume you wrote the document wrong.

## Documenting an extension

When a project registers extra components, document them next to the project's
own docs, not here. A document written against a custom registry will not render
in a host that lacks it - say so at the top of the document if it matters, and
prefer an `mdxstudio.config.js` committed to the repository so that "the host
that lacks it" stops being the common case.
