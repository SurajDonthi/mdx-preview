import type { ComponentType } from 'react';

/**
 * The MDX component registry.
 *
 * A document is rendered against a flat `name -> component` map. The renderer
 * resolves every JSX tag in the parsed MDX tree through it, and hands the same
 * map to `{...}` expressions as their scope. Anything not in the map is not
 * available to document authors - an unknown tag renders as a notice rather
 * than taking the document down.
 *
 * Rather than hard-coding that map, packages contribute *plugins* and the host
 * application composes them:
 *
 * ```ts
 * import { createMdxRegistry } from '@mdxstudio/core';
 * import { reactPlugin } from '@mdxstudio/react';
 * import { mermaidPlugin } from '@mdxstudio/mermaid';
 *
 * export const registry = createMdxRegistry(reactPlugin, mermaidPlugin, {
 *   MyOwnComponent,
 * });
 * ```
 *
 * This keeps `@mdxstudio/react` free of any dependency on Mermaid, Recharts or the
 * flow renderer: the app decides which of those it pays for.
 */

/** Anything the renderer can mount for an MDX tag. */
export type MdxComponent = ComponentType<any>;

/** The flat map the renderer consumes: MDX tag name -> component. */
export type MdxComponentMap = Record<string, MdxComponent>;

/**
 * A named bundle of MDX components contributed by one package.
 *
 * Build one with {@link defineMdxPlugin} so the registry can tell plugins apart
 * from plain component maps.
 */
export interface MdxPlugin {
  /** Package-style identifier. Only used in diagnostics. */
  name: string;
  /** Components registered under their own tag names. */
  components?: MdxComponentMap;
  /**
   * Extra tag names for components already registered by this plugin or by an
   * earlier one, e.g. `{ Mermaid: 'MermaidDiagram' }`.
   */
  aliases?: Record<string, string>;
  /**
   * Fenced code languages this plugin renders, e.g. `{ mermaid: 'MermaidDiagram' }`.
   *
   * When a document contains a ```` ```mermaid ```` fence the renderer mounts the
   * named component as `<Component language="mermaid">{code}</Component>`
   * instead of syntax-highlighting the block. Languages are matched
   * case-insensitively.
   */
  codeFences?: Record<string, string>;
}

/**
 * Something `createMdxRegistry` accepts: a plugin, or a bare component map for
 * one-off additions that do not deserve a plugin of their own.
 */
export type MdxRegistrySource = MdxPlugin | MdxComponentMap;

/** The resolved registry handed to `MdxRenderer`. */
export interface MdxRegistry {
  /** Every renderable tag name, aliases included. */
  components: MdxComponentMap;
  /** Lower-cased fence language -> component. */
  codeFences: Record<string, MdxComponent>;
}

const MDX_PLUGIN = Symbol.for('mdxstudio.plugin');

/**
 * Marks an object as an MDX plugin. Returns it unchanged apart from the brand,
 * so plugins stay plain data and can be inspected or spread by consumers.
 */
export function defineMdxPlugin(plugin: MdxPlugin): MdxPlugin {
  return { ...plugin, [MDX_PLUGIN]: true } as MdxPlugin;
}

function isMdxPlugin(source: MdxRegistrySource): source is MdxPlugin {
  return Boolean((source as Record<symbol, unknown>)[MDX_PLUGIN]);
}

function resolve(
  components: MdxComponentMap,
  target: string,
  pluginName: string,
  what: string
): MdxComponent {
  const component = components[target];
  if (!component) {
    throw new Error(
      `[@mdxstudio/core] ${pluginName} declares ${what} pointing at "${target}", ` +
        `but no component with that name is registered. Register it in the same ` +
        `plugin, or pass the plugin that provides it to createMdxRegistry() first.`
    );
  }
  return component;
}

/**
 * Composes registry sources into the map the renderer consumes.
 *
 * Sources are applied in order and later ones win, so an application can
 * override a component shipped by a package simply by listing its own
 * replacement last. Aliases and code fences are resolved after every source has
 * contributed, which lets a plugin alias a component provided by another one.
 *
 * @throws if an alias or a code fence names a component nothing registered.
 */
export function createMdxRegistry(...sources: MdxRegistrySource[]): MdxRegistry {
  const components: MdxComponentMap = {};
  const aliases: Array<[string, string, string]> = [];
  const fences: Array<[string, string, string]> = [];

  for (const source of sources) {
    if (!isMdxPlugin(source)) {
      Object.assign(components, source);
      continue;
    }
    Object.assign(components, source.components);
    for (const [name, target] of Object.entries(source.aliases ?? {})) {
      aliases.push([name, target, source.name]);
    }
    for (const [language, target] of Object.entries(source.codeFences ?? {})) {
      fences.push([language.toLowerCase(), target, source.name]);
    }
  }

  for (const [name, target, pluginName] of aliases) {
    components[name] = resolve(components, target, pluginName, `alias "${name}"`);
  }

  const codeFences: Record<string, MdxComponent> = {};
  for (const [language, target, pluginName] of fences) {
    codeFences[language] = resolve(
      components,
      target,
      pluginName,
      `code fence "${language}"`
    );
  }

  return { components, codeFences };
}

/** A registry with nothing in it. Useful as a default and in tests. */
export const emptyMdxRegistry: MdxRegistry = { components: {}, codeFences: {} };
