import { defineMdxPlugin } from '@mdxkit/core';
import { MermaidDiagram } from './MermaidDiagram';

export { MermaidDiagram };
export type { MermaidDiagramProps } from './MermaidDiagram';

/**
 * Registers `<MermaidDiagram>` (also available as `<Mermaid>`) and takes over
 * ```` ```mermaid ```` fenced code blocks.
 */
export const mermaidPlugin = defineMdxPlugin({
  name: '@mdxkit/mermaid',
  components: { MermaidDiagram },
  aliases: { Mermaid: 'MermaidDiagram' },
  codeFences: { mermaid: 'MermaidDiagram' },
});
