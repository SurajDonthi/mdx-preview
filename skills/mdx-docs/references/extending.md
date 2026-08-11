# Extending the component set

A document can only use what the **host application** registered. Adding a
component is a change to the application, never to the document - there is no
`import` a document can reach for.

Source of truth: `packages/core/src/registry.ts`.

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

## Documenting an extension

When a project registers extra components, document them next to the project's
own docs, not here. A document written against a custom registry will not render
in a host that lacks it - say so at the top of the document if it matters.
