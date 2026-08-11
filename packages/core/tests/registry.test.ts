/**
 * Registry composition. The ordering rules here are what let an application
 * override a component a package shipped, and what lets one plugin alias a
 * component another plugin provides - so the failure mode of getting them wrong
 * is a tag that silently resolves to the wrong component, or a build that only
 * breaks when plugins are listed in a particular order.
 */

import { describe, expect, it } from 'vitest';
import { createMdxRegistry, defineMdxPlugin, emptyMdxRegistry } from '@mdxstudio/core';
import type { MdxComponent } from '@mdxstudio/core';

/** Distinguishable stand-ins; identity is what the assertions compare. */
const component = (name: string): MdxComponent => {
  const Component = () => null;
  Component.displayName = name;
  return Component as MdxComponent;
};

describe('createMdxRegistry', () => {
  it('applies sources in order so a later one wins', () => {
    const first = component('first');
    const second = component('second');

    const registry = createMdxRegistry(
      defineMdxPlugin({ name: 'a', components: { Callout: first } }),
      defineMdxPlugin({ name: 'b', components: { Callout: second } })
    );

    expect(registry.components.Callout).toBe(second);
  });

  it('lets a bare component map override a plugin', () => {
    const shipped = component('shipped');
    const replacement = component('replacement');

    const registry = createMdxRegistry(
      defineMdxPlugin({ name: '@mdxstudio/react', components: { Callout: shipped } }),
      { Callout: replacement }
    );

    expect(registry.components.Callout).toBe(replacement);
  });

  it('accepts a bare component map alongside plugins and keeps both', () => {
    const fromPlugin = component('fromPlugin');
    const fromMap = component('fromMap');

    const registry = createMdxRegistry(
      defineMdxPlugin({ name: 'a', components: { Card: fromPlugin } }),
      { MyOwnComponent: fromMap }
    );

    expect(registry.components).toEqual({ Card: fromPlugin, MyOwnComponent: fromMap });
  });

  it('resolves aliases after every source has merged, not as each is applied', () => {
    const diagram = component('MermaidDiagram');

    // The plugin declaring the alias is listed *before* the one providing the
    // target. Resolving eagerly would throw here.
    const registry = createMdxRegistry(
      defineMdxPlugin({ name: 'aliases-first', aliases: { Mermaid: 'MermaidDiagram' } }),
      defineMdxPlugin({ name: '@mdxstudio/mermaid', components: { MermaidDiagram: diagram } })
    );

    expect(registry.components.Mermaid).toBe(diagram);
  });

  it('resolves an alias against the final winner, not the first definition', () => {
    const original = component('original');
    const override = component('override');

    const registry = createMdxRegistry(
      defineMdxPlugin({
        name: 'a',
        components: { Table: original },
        aliases: { CustomTable: 'Table' },
      }),
      { Table: override }
    );

    expect(registry.components.CustomTable).toBe(override);
  });

  it('resolves code fences after every source has merged, lower-cased', () => {
    const diagram = component('MermaidDiagram');

    const registry = createMdxRegistry(
      defineMdxPlugin({ name: 'fences-first', codeFences: { MerMaid: 'MermaidDiagram' } }),
      defineMdxPlugin({ name: '@mdxstudio/mermaid', components: { MermaidDiagram: diagram } })
    );

    expect(registry.codeFences).toEqual({ mermaid: diagram });
  });

  it('resolves a code fence pointing at an aliased name', () => {
    const diagram = component('MermaidDiagram');

    const registry = createMdxRegistry(
      defineMdxPlugin({
        name: '@mdxstudio/mermaid',
        components: { MermaidDiagram: diagram },
        aliases: { Mermaid: 'MermaidDiagram' },
        codeFences: { mermaid: 'Mermaid' },
      })
    );

    expect(registry.codeFences.mermaid).toBe(diagram);
  });

  it('throws naming the plugin when an alias points at nothing', () => {
    expect(() =>
      createMdxRegistry(
        defineMdxPlugin({ name: '@mdxstudio/mermaid', aliases: { Mermaid: 'MermaidDiagram' } })
      )
    ).toThrow(/@mdxstudio\/mermaid declares alias "Mermaid" pointing at "MermaidDiagram"/);
  });

  it('throws naming the plugin when a code fence points at nothing', () => {
    expect(() =>
      createMdxRegistry(
        defineMdxPlugin({ name: '@mdxstudio/charts', codeFences: { vega: 'VegaChart' } })
      )
    ).toThrow(/@mdxstudio\/charts declares code fence "vega" pointing at "VegaChart"/);
  });

  it('is empty when given nothing', () => {
    const nothing = { components: {}, codeFences: {}, remarkPlugins: [], rehypePlugins: [] };

    expect(createMdxRegistry()).toEqual(nothing);
    expect(emptyMdxRegistry).toEqual(nothing);
  });

  it('collects the unified plugins its sources contribute, in order', () => {
    const first = () => undefined;
    const second = () => undefined;
    const rehype = () => undefined;

    const registry = createMdxRegistry(
      defineMdxPlugin({ name: 'a', remarkPlugins: [first] }),
      defineMdxPlugin({ name: 'b', remarkPlugins: [second], rehypePlugins: [rehype] })
    );

    expect(registry.remarkPlugins).toEqual([first, second]);
    expect(registry.rehypePlugins).toEqual([rehype]);
  });

  it('keeps the sources it was given unmodified', () => {
    // Hosts build these at module scope and reuse them; composing a registry
    // must not write the merged result back into a plugin.
    const plugin = defineMdxPlugin({ name: 'a', components: { Card: component('Card') } });
    const map = { MyOwn: component('MyOwn') };

    createMdxRegistry(plugin, map);

    expect(Object.keys(plugin.components ?? {})).toEqual(['Card']);
    expect(Object.keys(map)).toEqual(['MyOwn']);
  });
});

describe('defineMdxPlugin', () => {
  it('marks a plugin without disturbing its data', () => {
    const Card = component('Card');
    const input = { name: 'a', components: { Card } };
    const plugin = defineMdxPlugin(input);

    expect(plugin).not.toBe(input);
    expect({ ...plugin }).toMatchObject(input);
  });

  it('is what tells a plugin apart from a component map', () => {
    // Unbranded, the object is merged as a component map, so `name` and
    // `components` would become tag names rather than plugin metadata.
    const Card = component('Card');
    const registry = createMdxRegistry({ name: 'a', components: { Card } } as never);

    expect(registry.components.Card).toBeUndefined();
    expect(Object.keys(registry.components).sort()).toEqual(['components', 'name']);
  });
});
