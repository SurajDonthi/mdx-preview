import { defineMdxPlugin } from '@mdxkit/core';
import { FlowGraph } from './FlowGraph';

export { FlowGraph };
export type {
  FlowGraphProps,
  FlowGraphData,
  FlowGraphNodeInput,
  FlowGraphEdgeInput,
  FlowGraphGroupInput,
  FlowGraphFlowInput,
} from './FlowGraph';

/** Registers `<FlowGraph>` (also available as `<ArchitectureMap>`). */
export const flowPlugin = defineMdxPlugin({
  name: '@mdxkit/flow',
  components: { FlowGraph },
  aliases: { ArchitectureMap: 'FlowGraph' },
});
