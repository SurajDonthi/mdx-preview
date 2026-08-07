# @mdxkit/flow

`<FlowGraph>` (also `<ArchitectureMap>`) for mdxkit: a declarative
architecture/flow diagram with grouped nodes, labelled edges and animated flows.
Rendered as SVG, no diagram engine required.

## Install

```sh
npm install @mdxkit/flow @mdxkit/core @mdxkit/react react
```

| Peer           | Range     |
| -------------- | --------- |
| `react`        | `^19.0.0` |
| `@mdxkit/core` | `^0.1.0`  |

## Usage

```ts
import { createRendererRegistry } from '@mdxkit/react';
import { flowPlugin } from '@mdxkit/flow';

export const registry = createRendererRegistry(flowPlugin);
```

```mdx
<FlowGraph
  data={{
    nodes: [
      { id: 'web', label: 'Web', group: 'edge' },
      { id: 'api', label: 'API', group: 'core' },
      { id: 'db', label: 'Postgres', group: 'core' },
    ],
    edges: [
      { from: 'web', to: 'api', label: 'HTTPS' },
      { from: 'api', to: 'db' },
    ],
  }}
/>
```

## Stylesheet

```ts
import '@mdxkit/flow/styles.css';
```

Required, in addition to `@mdxkit/react/styles.css`.

ESM only, with TypeScript declarations.

## License

MIT
