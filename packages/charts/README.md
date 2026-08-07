# @mdxstudio/charts

A Recharts-backed `<Chart>` for mdxkit: line, bar and area.

Recharts and its D3 dependencies (~350 kB minified) sit behind a dynamic
`import()`, so registering the plugin costs almost nothing and the charting
library downloads only when a chart mounts.

## Install

```sh
npm install @mdxstudio/charts @mdxstudio/core @mdxstudio/react react
```

| Peer           | Range     |
| -------------- | --------- |
| `react`        | `^19.0.0` |
| `@mdxstudio/core` | `^0.1.0`  |

`recharts` is an ordinary dependency.

## Usage

```ts
import { createRendererRegistry } from '@mdxstudio/react';
import { chartsPlugin } from '@mdxstudio/charts';

export const registry = createRendererRegistry(chartsPlugin);
```

```mdx
<Chart
  type="area"
  title="Signups"
  data={[{ name: 'Jan', value: 400 }, { name: 'Feb', value: 650 }]}
  dataKey="value"
  nameKey="name"
  color="#6366f1"
/>
```

## Stylesheet

```ts
import '@mdxstudio/charts/styles.css';
```

Required, in addition to `@mdxstudio/react/styles.css`.

ESM only, with TypeScript declarations.

## License

MIT
