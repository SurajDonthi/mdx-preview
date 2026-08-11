import { createRendererRegistry } from '@mdxstudio/react';
import type { MdxRegistry, MdxRegistrySource } from '@mdxstudio/core';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';
import { flowPlugin } from '@mdxstudio/flow';

/** The packages the CLI bundles, in the order the registry applies them. */
const CLI_PLUGINS = [mermaidPlugin, chartsPlugin, flowPlugin];

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
export const cliMdxRegistry = createRendererRegistry(...CLI_PLUGINS);

/**
 * The same set plus whatever `mdxstudio.config.js` contributed.
 *
 * The config is applied last, so a folder can override a component the CLI
 * ships simply by registering its own under that name. With nothing to add the
 * shared registry is returned as it is - a second object with the same contents
 * would re-parse every open document for no reason.
 */
export function cliRegistryWith(extras: MdxRegistrySource[]): MdxRegistry {
  return extras.length === 0 ? cliMdxRegistry : createRendererRegistry(...CLI_PLUGINS, ...extras);
}
