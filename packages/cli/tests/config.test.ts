/**
 * The optional `mdxstudio.config.js` in the folder being served.
 *
 * Two halves, tested separately because they run in different places: finding
 * the file (Node) and turning what it exported into registry sources (the
 * browser). The rule both of them answer to is that a folder without a config
 * behaves exactly as it did before, and a folder with a broken one still shows
 * its documents.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CONFIG_FILENAMES, findConfigFile } from '../src/config';
import { configSource, loadMdxConfig } from '../src/client/config';
import type { MdxConfigContext } from '../src/client/config';

let empty: string;
let withJs: string;
let withMjs: string;
let withBoth: string;

beforeAll(async () => {
  const make = async (files: string[]): Promise<string> => {
    const root = await mkdtemp(path.join(tmpdir(), 'mdxstudio-config-'));
    for (const name of files) await writeFile(path.join(root, name), 'export default {};\n', 'utf8');
    return root;
  };

  empty = await make([]);
  withJs = await make(['mdxstudio.config.js']);
  withMjs = await make(['mdxstudio.config.mjs']);
  withBoth = await make([...CONFIG_FILENAMES]);
});

afterAll(async () => {
  for (const root of [empty, withJs, withMjs, withBoth]) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('findConfigFile', () => {
  it('finds nothing in a folder without one', async () => {
    expect(await findConfigFile(empty)).toBeNull();
  });

  it('finds either extension', async () => {
    expect(await findConfigFile(withJs)).toBe('mdxstudio.config.js');
    expect(await findConfigFile(withMjs)).toBe('mdxstudio.config.mjs');
  });

  it('prefers .js when a folder has both', async () => {
    expect(await findConfigFile(withBoth)).toBe('mdxstudio.config.js');
  });

  it('is not an error to point it at a folder that is not there', async () => {
    expect(await findConfigFile(path.join(empty, 'no', 'such', 'folder'))).toBeNull();
  });
});

const Chip = () => null;
const Other = () => null;

const context: MdxConfigContext = {
  React: { createElement: () => null },
  createElement: () => null,
  components: { Callout: Other },
};

/** Stands in for `createRendererRegistry`, without the packages behind it. */
const build = (sources: unknown[]) => ({ sources });

/** Loads a config whose module is `exported`, with no network involved. */
const load = (exported: unknown, file = 'mdxstudio.config.js') =>
  loadMdxConfig({
    file,
    context,
    build,
    load: async () => exported,
  });

describe('loadMdxConfig', () => {
  it('turns a plain object into one registry source', async () => {
    const loaded = await load({ default: { components: { Chip } } });

    expect(loaded.error).toBeNull();
    expect(loaded.registry.sources).toHaveLength(1);
    expect((loaded.registry.sources[0] as { components: unknown }).components).toEqual({ Chip });
  });

  it('calls a function export with the context', async () => {
    let seen: MdxConfigContext | null = null;
    const loaded = await load({
      default: (given: MdxConfigContext) => {
        seen = given;
        return { components: { Chip } };
      },
    });

    expect(loaded.error).toBeNull();
    expect(seen).toBe(context);
  });

  it('awaits an async function export', async () => {
    const loaded = await load({ default: async () => ({ components: { Chip } }) });

    expect(loaded.error).toBeNull();
    expect((loaded.registry.sources[0] as { components: unknown }).components).toEqual({ Chip });
  });

  it('carries aliases, fences and unified plugins through', async () => {
    const remark = () => undefined;
    const loaded = await load({
      default: {
        components: { Chip },
        aliases: { Tag: 'Chip' },
        codeFences: { chip: 'Chip' },
        remarkPlugins: [remark],
      },
    });

    const source = loaded.registry.sources[0] as Record<string, unknown>;
    expect(source.aliases).toEqual({ Tag: 'Chip' });
    expect(source.codeFences).toEqual({ chip: 'Chip' });
    expect(source.remarkPlugins).toEqual([remark]);
  });

  it('names the file when the module throws on import', async () => {
    const loaded = await loadMdxConfig({
      file: 'mdxstudio.config.js',
      context,
      build,
      load: async () => {
        throw new Error('ReferenceError: notDefined is not defined');
      },
    });

    expect(loaded.error).toBe(
      'mdxstudio.config.js could not be loaded: ReferenceError: notDefined is not defined'
    );
    // Still a registry, so the folder renders with the built-ins.
    expect(loaded.registry.sources).toEqual([]);
  });

  it('names the file when the exported function throws', async () => {
    const loaded = await load({
      default: () => {
        throw new Error('boom');
      },
    });

    expect(loaded.error).toBe('mdxstudio.config.js could not be loaded: boom');
    expect(loaded.registry.sources).toEqual([]);
  });

  it('names the file when there is no default export', async () => {
    const loaded = await load({ components: { Chip } });

    expect(loaded.error).toMatch(/^mdxstudio\.config\.js has no default export\./);
    expect(loaded.registry.sources).toEqual([]);
  });

  it('names the file when the default export is the wrong kind of thing', async () => {
    const loaded = await load({ default: 'components' });

    expect(loaded.error).toBe(
      'mdxstudio.config.js exported string; expected an object, or a function returning one.'
    );
  });

  it('names the file when the registry rejects what it declared', async () => {
    // An alias pointing at a component nothing registered: `createMdxRegistry`
    // throws, and the reader has to be told which file said so.
    const loaded = await loadMdxConfig({
      file: 'mdxstudio.config.mjs',
      context,
      build: (sources) => {
        if (sources.length > 0) throw new Error('alias "Tag" points at "Missing"');
        return { sources };
      },
      load: async () => ({ default: { aliases: { Tag: 'Missing' } } }),
    });

    expect(loaded.error).toBe(
      'mdxstudio.config.mjs could not be applied: alias "Tag" points at "Missing"'
    );
    expect(loaded.registry.sources).toEqual([]);
  });

  it('imports the file from the root of the served folder', async () => {
    const asked: string[] = [];
    await loadMdxConfig({
      file: 'mdxstudio.config.mjs',
      context,
      build,
      load: async (specifier) => {
        asked.push(specifier);
        return { default: {} };
      },
    });

    expect(asked).toEqual(['/mdxstudio.config.mjs']);
  });
});

describe('configSource', () => {
  it('names the source after the file, so a failure points at it', () => {
    const { source } = configSource('mdxstudio.config.js', { components: { Chip } });

    expect((source as { name: string }).name).toBe('mdxstudio.config.js');
  });
});
