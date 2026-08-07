# @mdxstudio/flow

`<FlowGraph>` (also `<ArchitectureMap>`) for mdxstudio: a declarative
architecture/flow diagram with grouped nodes, labelled edges and animated flows.
Rendered as SVG, no diagram engine required.

## Install

```sh
npm install @mdxstudio/flow @mdxstudio/core @mdxstudio/react react
```

| Peer           | Range     |
| -------------- | --------- |
| `react`        | `^19.0.0` |
| `@mdxstudio/core` | `^0.1.0`  |

## Usage

```ts
import { createRendererRegistry } from '@mdxstudio/react';
import { flowPlugin } from '@mdxstudio/flow';

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
import '@mdxstudio/flow/styles.css';
```

Required, in addition to `@mdxstudio/react/styles.css`.

ESM only, with TypeScript declarations.

## License

MIT
