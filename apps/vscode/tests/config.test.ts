import { describe, expect, it } from 'vitest';

import { loadMdxConfig } from '@mdxstudio/core';
import type { MdxConfigContext } from '@mdxstudio/core';

import { CONFIG_FILENAMES, configLocations } from '../src/extension/config';
import { resolveConfigPolicy } from '../src/extension/policy';
import { previewRegistry, previewRegistryWith } from '../src/webview/registry';

/*
 * The workspace's `mdxstudio.config.js`: where the extension looks for it, and
 * what happens to the preview when the file it finds is wrong.
 *
 * The trust half of the decision lives in `policy.test.ts`. This is the other
 * half - a config that is allowed to load still has to land in the registry the
 * preview actually renders with, and a broken one still has to leave the
 * document on screen.
 */

const trusted = (setting = '') => resolveConfigPolicy(setting, true);

describe('configLocations', () => {
  it('looks for both names, in the CLI order, in the document folder', () => {
    expect(configLocations(trusted(), true)).toEqual([
      { base: 'folder', path: 'mdxstudio.config.js' },
      { base: 'folder', path: 'mdxstudio.config.mjs' },
    ]);
    expect(CONFIG_FILENAMES).toEqual(['mdxstudio.config.js', 'mdxstudio.config.mjs']);
  });

  it('does not discover one for a file that belongs to no workspace folder', () => {
    // A loose document has no project, and a project is what a config belongs
    // to. Naming one in the setting is the way to say otherwise.
    expect(configLocations(trusted(), false)).toEqual([]);
  });

  it('takes a workspace-relative path from the setting', () => {
    expect(configLocations(trusted('.vscode/preview.config.js'), true)).toEqual([
      { base: 'folder', path: '.vscode/preview.config.js' },
    ]);
  });

  it('resolves a relative path against the document when there is no folder', () => {
    expect(configLocations(trusted('preview.config.js'), false)).toEqual([
      { base: 'document', path: 'preview.config.js' },
    ]);
  });

  it('leaves an absolute path alone', () => {
    expect(configLocations(trusted('/home/me/shared.config.js'), true)).toEqual([
      { base: 'absolute', path: '/home/me/shared.config.js' },
    ]);
  });

  it('looks for nothing at all when the setting is off', () => {
    expect(configLocations(resolveConfigPolicy('off', true), true)).toEqual([]);
    expect(configLocations(resolveConfigPolicy('off', false), true)).toEqual([]);
  });

  it('still looks in an untrusted workspace, because the banner names the file', () => {
    // Finding it is a stat; loading it is what trust forbids, and that is
    // `policy.enabled`. Saying "this workspace has one and it is not being
    // loaded" is worth more than saying nothing.
    const untrusted = resolveConfigPolicy('', false);
    expect(untrusted.enabled).toBe(false);
    expect(configLocations(untrusted, true)).toHaveLength(2);
  });

  it('reports the file the setting names even untrusted, not the default names', () => {
    expect(configLocations(resolveConfigPolicy('cfg/mine.js', false), true)).toEqual([
      { base: 'folder', path: 'cfg/mine.js' },
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * What the file exports, against the registry the preview really uses
 * ------------------------------------------------------------------ */

const Chip = () => null;

const context: MdxConfigContext = {
  React: { createElement: () => null },
  createElement: () => null,
  components: previewRegistry.components,
};

/** Loads a config whose module is `exported`, with no webview involved. */
const load = (exported: unknown, file = 'mdxstudio.config.js') =>
  loadMdxConfig({
    file,
    specifier: `https://file+.vscode-resource.vscode-cdn.net/d%3A/repo/${file}`,
    context,
    build: previewRegistryWith,
    load: async () => exported,
  });

describe('previewRegistryWith', () => {
  /*
   * A config's components arrive wrapped in the error boundary
   * `src/webview/registry.tsx` puts around them - `componentGuard.test.ts` is
   * where that behaviour is pinned down - so these assert that the name is
   * registered and resolves consistently, not that it is the same function
   * object the config handed over.
   */
  it('adds the config’s components to the ones the extension ships', async () => {
    const loaded = await load({ default: { components: { Chip } } });

    expect(loaded.error).toBeNull();
    expect(loaded.registry.components.Chip).toBeTypeOf('function');
    // Still everything that was there before it.
    expect(loaded.registry.components.MermaidDiagram).toBeDefined();
    expect(loaded.registry.components.FlowGraph).toBeDefined();
    expect(loaded.registry.codeFences.mermaid).toBeDefined();
  });

  it('lets a config override a component the extension ships', async () => {
    const loaded = await load({ default: { components: { Chart: Chip } } });

    expect(loaded.registry.components.Chart).not.toBe(previewRegistry.components.Chart);
  });

  it('carries aliases, fences and remark plugins into the registry', async () => {
    const remark = () => undefined;
    const loaded = await load({
      default: {
        components: { Chip },
        aliases: { Tag: 'Chip' },
        codeFences: { chip: 'Chip' },
        remarkPlugins: [remark],
      },
    });

    expect(loaded.error).toBeNull();
    expect(loaded.registry.components.Tag).toBe(loaded.registry.components.Chip);
    expect(loaded.registry.codeFences.chip).toBe(loaded.registry.components.Chip);
    expect(loaded.registry.remarkPlugins).toContain(remark);
  });

  it('hands back the shared registry when there is nothing to add', () => {
    // Identity matters: `MdxRenderer` re-parses the document whenever the
    // registry object changes.
    expect(previewRegistryWith([])).toBe(previewRegistry);
  });
});

describe('a config that cannot be used', () => {
  it('names the file when the module throws on import', async () => {
    const loaded = await loadMdxConfig({
      file: 'mdxstudio.config.js',
      specifier: 'https://file+.vscode-resource.vscode-cdn.net/x/mdxstudio.config.js',
      context,
      build: previewRegistryWith,
      load: async () => {
        throw new Error('ReferenceError: notDefined is not defined');
      },
    });

    expect(loaded.error).toBe(
      'mdxstudio.config.js could not be loaded: ReferenceError: notDefined is not defined'
    );
    // And the preview still has every component it shipped with.
    expect(loaded.registry).toBe(previewRegistry);
  });

  it('names the file when the exported function throws', async () => {
    const loaded = await load({
      default: () => {
        throw new Error('boom');
      },
    });

    expect(loaded.error).toBe('mdxstudio.config.js could not be loaded: boom');
    expect(loaded.registry).toBe(previewRegistry);
  });

  it('names the file when there is no default export', async () => {
    const loaded = await load({ components: { Chip } });

    expect(loaded.error).toMatch(/^mdxstudio\.config\.js has no default export\./);
    expect(loaded.registry).toBe(previewRegistry);
  });

  it('names the file when an alias points at nothing', async () => {
    // `createMdxRegistry` throws for this, and the throw has to become a
    // message rather than an empty preview.
    const loaded = await load({ default: { aliases: { Tag: 'Missing' } } }, 'mdxstudio.config.mjs');

    expect(loaded.error).toMatch(/^mdxstudio\.config\.mjs could not be applied:/);
    expect(loaded.error).toContain('Missing');
    expect(loaded.registry).toBe(previewRegistry);
  });

  it('imports the URL the host resolved, not a path of its own', async () => {
    const asked: string[] = [];
    await loadMdxConfig({
      file: 'mdxstudio.config.js',
      specifier: 'https://file+.vscode-resource.vscode-cdn.net/d%3A/repo/mdxstudio.config.js?v=3',
      context,
      build: previewRegistryWith,
      load: async (specifier) => {
        asked.push(specifier);
        return { default: {} };
      },
    });

    // A webview cannot resolve a disk path, and the `?v=` is what stops a
    // config edited on disk being served out of the module cache.
    expect(asked).toEqual([
      'https://file+.vscode-resource.vscode-cdn.net/d%3A/repo/mdxstudio.config.js?v=3',
    ]);
  });
});
