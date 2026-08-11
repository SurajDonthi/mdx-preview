import React, { Component } from 'react';
import { createRendererRegistry } from '@mdxstudio/react';
import type {
  MdxComponent,
  MdxComponentMap,
  MdxRegistry,
  MdxRegistrySource,
} from '@mdxstudio/core';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';
import { flowPlugin } from '@mdxstudio/flow';
import { tasksPlugin } from '@mdxstudio/tasks';

import { vscodeHostPlugin } from './documentBase';

/**
 * The packages the extension bundles, in the order the registry applies them.
 *
 * `vscodeHostPlugin` comes last so its `img` and `a` replace the built-ins -
 * without them a relative `src` is a path the webview is not allowed to read.
 */
const PREVIEW_PLUGINS = [mermaidPlugin, chartsPlugin, flowPlugin, tasksPlugin, vscodeHostPlugin];

/**
 * Everything a previewed document may name.
 *
 * Module-level, because `MdxRenderer` re-parses whenever the registry's
 * identity changes - a registry rebuilt per render would re-parse the document
 * on every keystroke *and* on every scroll.
 */
export const previewRegistry = createRendererRegistry(...PREVIEW_PLUGINS);

/**
 * Catches one component throwing, without the rest of the document going with
 * it.
 *
 * `MdxRenderer` has a boundary of its own, but it wraps the whole rendered
 * tree: a component that throws there replaces the document with a notice,
 * which for a config the reader is in the middle of writing means the document
 * disappears at the first typo. One boundary per contributed tag turns that
 * into a marker where the component would have been.
 *
 * `props` is the reset key. Every render builds new prop objects, so a
 * component that has been fixed - or that only threw for one document - is
 * tried again rather than being remembered as broken forever.
 */
class ComponentBoundary extends Component<
  { name: string; props: unknown; children: React.ReactNode },
  { error: Error | null; props: unknown }
> {
  constructor(props: { name: string; props: unknown; children: React.ReactNode }) {
    super(props);
    this.state = { error: null, props: props.props };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { props: unknown },
    state: { props: unknown }
  ) {
    if (props.props !== state.props) return { error: null, props: props.props };
    return null;
  }

  componentDidCatch(error: Error) {
    console.warn(`[mdxstudio] <${this.props.name}> threw while rendering:`, error);
  }

  render() {
    if (this.state.error) {
      return (
        <span className="mdxstudio-vscode-component-error">
          {`<${this.props.name}> threw: ${this.state.error.message}`}
        </span>
      );
    }
    return this.props.children;
  }
}

function guard(name: string, Contributed: MdxComponent): MdxComponent {
  const Guarded = (props: Record<string, unknown>) => (
    <ComponentBoundary name={name} props={props}>
      <Contributed {...props} />
    </ComponentBoundary>
  );
  Guarded.displayName = `Guarded(${name})`;
  return Guarded;
}

/**
 * The same source with every component it registers wrapped in a boundary.
 *
 * Applied to what `mdxstudio.config.js` contributed and to nothing else: the
 * components the extension ships are tested, a workspace's are being written.
 * Aliases are left alone - they name a component by string and are resolved
 * against the wrapped map, so they inherit the boundary for free.
 */
function guarded(source: MdxRegistrySource): MdxRegistrySource {
  const plugin = source as { components?: MdxComponentMap };
  if (!plugin.components) return source;

  const components: MdxComponentMap = {};
  for (const [name, component] of Object.entries(plugin.components)) {
    components[name] = guard(name, component);
  }
  // Spread rather than mutate: the source is the caller's object, and the
  // symbol brand `defineMdxPlugin` put on it has to survive.
  return { ...(source as object), components } as MdxRegistrySource;
}

/**
 * The bundled set plus whatever the workspace's `mdxstudio.config.js`
 * contributed, composed as `packages/cli/src/client/registry.ts` composes it -
 * the config file is the same file, so the registry it lands in has to behave
 * the same way.
 *
 * The config is applied last, so a workspace can override a component the
 * extension ships simply by registering its own under that name. With nothing
 * to add the shared registry is returned as it is: a second object with the
 * same contents would re-parse the open document for no reason.
 */
export function previewRegistryWith(extras: MdxRegistrySource[]): MdxRegistry {
  return extras.length === 0
    ? previewRegistry
    : createRendererRegistry(...PREVIEW_PLUGINS, ...extras.map(guarded));
}
