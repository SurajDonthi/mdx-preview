import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { scanDocs, titleFromContent, titleFromFilename } from '../src/scan';
import { createMemorySource, safeJoin } from '../src/source';

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mdxstudio-cli-'));

  const write = async (relative: string, content: string): Promise<void> => {
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  };

  await write('README.md', '# Read me first\n');
  await write('zebra.mdx', '---\ntitle: "Zebra"\n---\n\n# Something else\n');
  await write('alpha.mdx', 'no title at all\n');
  await write('guides/getting-started.mdx', '# Getting started\n');
  await write('guides/notes.txt', 'not a document');
  await write('node_modules/pkg/readme.md', '# Should never be listed\n');
  await write('.hidden/secret.mdx', '# Hidden\n');
  await write('build/output.mdx', '# Built\n');
  await write('.gitignore', 'build/\n');
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('scanDocs', () => {
  it('finds .mdx and .md, and nothing else', async () => {
    const docs = await scanDocs(root);
    const paths = docs.map((doc) => doc.path);

    expect(paths).toContain('README.md');
    expect(paths).toContain('alpha.mdx');
    expect(paths).toContain('guides/getting-started.mdx');
    expect(paths).not.toContain('guides/notes.txt');
  });

  it('never walks node_modules, dotted directories, or ignored ones', async () => {
    const paths = (await scanDocs(root)).map((doc) => doc.path);

    expect(paths.some((docPath) => docPath.includes('node_modules'))).toBe(false);
    expect(paths.some((docPath) => docPath.startsWith('.hidden'))).toBe(false);
    expect(paths).not.toContain('build/output.mdx');
  });

  it('includes gitignored files when asked to', async () => {
    const paths = (await scanDocs(root, { respectGitignore: false })).map((doc) => doc.path);
    expect(paths).toContain('build/output.mdx');
  });

  it('titles a document from frontmatter, then a heading, then its name', async () => {
    const docs = await scanDocs(root);
    const title = (docPath: string): string | undefined =>
      docs.find((doc) => doc.path === docPath)?.title;

    expect(title('zebra.mdx')).toBe('Zebra');
    expect(title('README.md')).toBe('Read me first');
    expect(title('alpha.mdx')).toBe('Alpha');
  });

  it('puts the root ahead of subdirectories, and README ahead of its siblings', async () => {
    const paths = (await scanDocs(root)).map((doc) => doc.path);
    expect(paths.indexOf('README.md')).toBe(0);
    expect(paths.indexOf('alpha.mdx')).toBeLessThan(paths.indexOf('guides/getting-started.mdx'));
  });

  it('reuses a cached title while the file is unchanged', async () => {
    const cache = new Map<string, { mtimeMs: number; title: string }>();
    const first = await scanDocs(root, { cache });
    expect(cache.size).toBe(first.length);

    cache.set('alpha.mdx', { mtimeMs: cache.get('alpha.mdx')!.mtimeMs, title: 'From cache' });
    const second = await scanDocs(root, { cache });
    expect(second.find((doc) => doc.path === 'alpha.mdx')?.title).toBe('From cache');
  });
});

describe('titleFromContent', () => {
  it('prefers frontmatter over a heading', () => {
    expect(titleFromContent('---\ntitle: A\n---\n# B\n', 'fallback')).toBe('A');
  });

  it('strips the quotes a YAML title is usually written with', () => {
    expect(titleFromContent('---\ntitle: "Quoted"\n---\n', 'fallback')).toBe('Quoted');
  });

  it('falls back when there is nothing to read', () => {
    expect(titleFromContent('just prose\n', 'fallback')).toBe('fallback');
  });
});

describe('titleFromFilename', () => {
  it('turns a slug into a sentence', () => {
    expect(titleFromFilename('guides/getting-started.mdx')).toBe('Getting started');
    expect(titleFromFilename('some_file.md')).toBe('Some file');
  });
});

describe('safeJoin', () => {
  it('refuses to leave the root', () => {
    expect(safeJoin(root, '../etc/passwd')).toBeNull();
    expect(safeJoin(root, 'guides/../../outside.mdx')).toBeNull();
    expect(safeJoin(root, '/absolute.mdx')).toBeNull();
    expect(safeJoin(root, 'C:/windows/system32')).toBeNull();
    expect(safeJoin(root, '')).toBeNull();
  });

  it('resolves a path that stays inside', () => {
    expect(safeJoin(root, 'guides/getting-started.mdx')).toBe(
      path.resolve(root, 'guides/getting-started.mdx')
    );
  });
});

describe('createMemorySource', () => {
  it('serves exactly one document and names it from its content', async () => {
    const source = createMemorySource('stdin.mdx', '---\ntitle: Piped in\n---\n\nbody\n');

    expect(source.single).toBe(true);
    expect(source.label).toBe('Piped in');
    expect(await source.list()).toHaveLength(1);
    expect((await source.read('stdin.mdx'))?.content).toContain('body');
    expect(await source.read('other.mdx')).toBeNull();
    expect(await source.resolveAsset('anything.png')).toBeNull();
    expect(source.watch(() => {})).toBeNull();
  });
});
