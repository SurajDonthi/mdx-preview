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
});

const registry = createMdxRegistry(myPlugin);
```

## Exports

Parsing (`parseMdxDocument`, `parseFrontmatter`, `collectHeadings`,
`extractHeadings`, `calculateDocumentStats`, `formatMdxParseError`, `countLines`,
`slugify`), expression evaluation (`evaluateEstreeLiteral`,
`createFullEstreeEvaluator`), the registry (`defineMdxPlugin`,
`createMdxRegistry`, `emptyMdxRegistry`), `MdxRenderContext`, and the shared
types.

ESM only, with TypeScript declarations.

## License

MIT
