import { createMdxRegistry, defineMdxPlugin } from '@mdxstudio/core';
import type { MdxRegistry, MdxRegistrySource } from '@mdxstudio/core';
import { baseMdxAliases, baseMdxComponents } from './CustomComponents';

/**
 * The components `@mdxstudio/react` ships itself: layout, callouts, tabs, badges
 * and the other light primitives that only cost React and `lucide-react`.
 */
export const reactPlugin = defineMdxPlugin({
  name: '@mdxstudio/react',
  components: baseMdxComponents,
  aliases: baseMdxAliases,
});

/**
 * Builds the registry for `MdxRenderer` from the built-in components plus
 * whatever the host adds.
 *
 * ```ts
 * const registry = createRendererRegistry(mermaidPlugin, chartsPlugin, flowPlugin);
 * <MdxRenderer content={mdx} themeConfig={theme} registry={registry} />
 * ```
 *
 * Extras are applied after the built-ins, so passing a component under a
 * built-in name replaces it.
 */
export function createRendererRegistry(...extras: MdxRegistrySource[]): MdxRegistry {
  return createMdxRegistry(reactPlugin, ...extras);
}

/** The built-in components only. `MdxRenderer`'s default registry. */
export const baseMdxRegistry: MdxRegistry = createRendererRegistry();
