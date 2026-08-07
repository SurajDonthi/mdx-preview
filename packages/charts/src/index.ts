import { defineMdxPlugin } from '@mdxstudio/core';
import { Chart } from './Chart';

export { Chart };
export type { ChartProps } from './Chart';

/** Registers `<Chart>`, a Recharts-backed line/bar/area chart. */
export const chartsPlugin = defineMdxPlugin({
  name: '@mdxstudio/charts',
  components: { Chart },
});
