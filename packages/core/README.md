# @mdxstudio/core

The renderer-agnostic half of mdxstudio: MDX parsing, frontmatter, heading
extraction, document stats, the expression evaluator, the component registry, and
the React context every mdxstudio package reads its render mode and theme from.

You rarely install this directly — [`@mdxstudio/react`](https://github.com/SurajDonthi/mdx-preview/tree/main/packages/react#readme)
and the plugin packages declare it as a peer dependency so that exactly one copy
exists in an app. A second copy means a second `MdxRenderContext`, and components
that read it would silently see defaults.

## Install

```sh
npm install @mdxstudio/core react
```

| Peer    | Range     | Why                                    |
| ------- | --------- | -------------------------------------- |
| `react` | `^19.0.0` | `MdxRenderContext` is a React context. |

No stylesheet.

## Usage

```ts
import { parseFrontmatter, extractHeadings, calculateDocumentStats } from '@mdxstudio/core';

const { frontmatter, body } = parseFrontmatter(source);
const headings = extractHeadings(body);        // → table of contents
const stats = calculateDocumentStats(source);  // → words, reading time, ...
```

Registering components for a renderer:

```ts
import { defineMdxPlugin, createMdxRegistry } from '@mdxstudio/core';

const myPlugin = defineMdxPlugin({
  name: 'my-app',
  components: { Ticket },
  aliases: { Issue: 'Ticket' },
  codeFences: { graphviz: 'Graphviz' },
  remarkPlugins: [remarkDirective],   // extends the syntax, not just the vocabulary
  rehypePlugins: [],
});

const registry = createMdxRegistry(myPlugin);
```

`remarkPlugins` and `rehypePlugins` are collected in source order and end up on
the registry, which `MdxRenderer` passes to the parser. `parseMdxDocument` and
`extractHeadings` take the same two lists directly. Pass module-level constants:
the processor and the parse cache are keyed by the identity of the arrays, so a
fresh array on every render re-parses the document.

### Who consumes a registry

A registry is only useful once something renders with it, and there are three
somethings:

- **Your own application** passes it to `<MdxRenderer registry={...}>` — see
  [`@mdxstudio/react`](https://www.npmjs.com/package/@mdxstudio/react).
- **`npx @mdxstudio/cli serve`** builds one from the served folder's
  `mdxstudio.config.js`.
- **The VS Code extension** builds one from the workspace folder's
  `mdxstudio.config.js`, the same file, when the workspace is trusted.

`loadMdxConfig` and `configSource`, exported here, are what the last two use:
they turn a config file's default export into an `MdxRegistrySource` and turn
every way it can be wrong into a message naming the file rather than a throw.
`MDX_CONFIG_FILENAMES` is the pair of names both of them look for.

## What the parser understands

Beyond CommonMark, GFM and MDX itself:

- **Math.** `$inline$` and `$$block$$`, via `remark-math`, become
  `<MathExpression tex="..." />` elements — a component, so a renderer can load
  KaTeX only for documents that contain math. A single-dollar span is only read
  as math when it opens on a non-space, closes on a non-space and is not
  followed by a digit, so `it costs $5 and $10` stays prose.
- **GitHub alerts.** `> [!NOTE]` and its four siblings (`TIP`, `IMPORTANT`,
  `WARNING`, `CAUTION`, any case) become `<Callout type="..." title="..." />`.
  An unknown marker stays an ordinary blockquote.

Both produce ordinary MDX element nodes, so nothing downstream has to know they
came from markdown rather than from a tag the author typed.

## Exports

Parsing (`parseMdxDocument`, `parseFrontmatter`, `collectHeadings`,
`extractHeadings`, `calculateDocumentStats`, `formatMdxParseError`, `countLines`,
`slugify`), expression evaluation (`evaluateEstreeLiteral`,
`createFullEstreeEvaluator`), the registry (`defineMdxPlugin`,
`createMdxRegistry`, `emptyMdxRegistry`), the config-file contract
(`loadMdxConfig`, `configSource`, `MDX_CONFIG_FILENAMES`), `MdxRenderContext`,
`MATH_COMPONENT` (the tag name math is rendered through), and the shared types.

ESM only, with TypeScript declarations.

## License

MIT
