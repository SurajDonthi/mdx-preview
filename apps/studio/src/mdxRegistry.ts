import { createRendererRegistry } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';
import { flowPlugin } from '@mdxstudio/flow';

/**
 * Everything a Studio document may use: the light built-ins from
 * `@mdxstudio/react` plus the heavier renderers this app chooses to bundle.
 *
 * Module-level so its identity is stable - `MdxRenderer` re-compiles the
 * document whenever the registry changes.
 */
export const studioMdxRegistry = createRendererRegistry(
  mermaidPlugin,
  chartsPlugin,
  flowPlugin
);
