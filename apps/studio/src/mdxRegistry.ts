import { createRendererRegistry } from '@mdxkit/react';
import { mermaidPlugin } from '@mdxkit/mermaid';
import { chartsPlugin } from '@mdxkit/charts';
import { flowPlugin } from '@mdxkit/flow';

/**
 * Everything a Studio document may use: the light built-ins from
 * `@mdxkit/react` plus the heavier renderers this app chooses to bundle.
 *
 * Module-level so its identity is stable - `MdxRenderer` re-compiles the
 * document whenever the registry changes.
 */
export const studioMdxRegistry = createRendererRegistry(
  mermaidPlugin,
  chartsPlugin,
  flowPlugin
);
