import { createRendererRegistry } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';
import { flowPlugin } from '@mdxstudio/flow';

/**
 * The same set the Studio composes in `apps/studio/src/mdxRegistry.ts`: the
 * built-ins from `@mdxstudio/react` plus Mermaid, charts and flow graphs.
 *
 * It has to be the same set. A document that renders in the web application
 * and not in the CLI - or the reverse - would make both untrustworthy, and the
 * whole point of reading a repository's docs locally is that what you see is
 * what the document says.
 *
 * Module-level, so its identity is stable: `MdxRenderer` re-compiles the
 * document whenever the registry changes.
 */
export const cliMdxRegistry = createRendererRegistry(mermaidPlugin, chartsPlugin, flowPlugin);
