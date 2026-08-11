import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDocServer } from '../src/server';
import { createDirectorySource, createMemorySource } from '../src/source';
import type { DocResponse, TreeResponse } from '../src/protocol';

let root: string;
let server: ReturnType<typeof createDocServer>;
let origin: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'mdxstudio-cli-server-'));
  await writeFile(path.join(root, 'index.mdx'), '---\ntitle: Index\n---\n\n# Index\n', 'utf8');
  await mkdir(path.join(root, 'assets'), { recursive: true });
  await writeFile(path.join(root, 'assets/logo.svg'), '<svg/>', 'utf8');
  await writeFile(path.join(root, 'secret.txt'), 'not a document', 'utf8');

  // Watching is off: these tests are about the HTTP surface, and a live
  // watcher would keep the worker alive after the suite finished.
  server = createDocServer(createDirectorySource(root, { watch: false }), { watch: false });
  const port = await server.listen(0, '127.0.0.1');
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

describe('the document API', () => {
  it('lists the folder', async () => {
    const tree = (await (await fetch(`${origin}/__mdxstudio/api/tree`)).json()) as TreeResponse;
    expect(tree.docs.map((doc) => doc.path)).toEqual(['index.mdx']);
    expect(tree.single).toBe(false);
  });

  it('returns a document by path', async () => {
    const doc = (await (
      await fetch(`${origin}/__mdxstudio/api/doc?path=index.mdx`)
    ).json()) as DocResponse;
    expect(doc.content).toContain('# Index');
  });

  it('404s a document that is not there', async () => {
    const response = await fetch(`${origin}/__mdxstudio/api/doc?path=nope.mdx`);
    expect(response.status).toBe(404);
  });

  it('refuses to read outside the served folder', async () => {
    const response = await fetch(
      `${origin}/__mdxstudio/api/doc?path=${encodeURIComponent('../../etc/passwd')}`
    );
    expect(response.status).toBe(404);
  });
});

describe('the pages', () => {
  it('serves the shell at the root', async () => {
    const response = await fetch(`${origin}/`);
    const body = await response.text();
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('mdxstudio-boot-data');
  });

  it('serves the shell for a document URL, so a deep link works', async () => {
    const response = await fetch(`${origin}/index.mdx`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('<div id="root">');
  });

  it('serves a file the document links to relatively', async () => {
    const response = await fetch(`${origin}/assets/logo.svg`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
  });

  it('does not let a URL climb out of the folder', async () => {
    const response = await fetch(`${origin}/${encodeURIComponent('../package.json')}`);
    expect(response.status).toBe(404);
  });

  it('refuses anything but a read', async () => {
    const response = await fetch(`${origin}/`, { method: 'POST' });
    expect(response.status).toBe(405);
  });
});

describe('a document from stdin', () => {
  it('serves one document with no folder behind it', async () => {
    const single = createDocServer(createMemorySource('stdin.mdx', '# Piped\n'), { watch: false });
    const port = await single.listen(0, '127.0.0.1');

    try {
      const tree = (await (
        await fetch(`http://127.0.0.1:${port}/__mdxstudio/api/tree`)
      ).json()) as TreeResponse;
      expect(tree.single).toBe(true);
      expect(tree.docs).toHaveLength(1);

      const shell = await (await fetch(`http://127.0.0.1:${port}/stdin.mdx`)).text();
      expect(shell).toContain('"single":true');
    } finally {
      await single.close();
    }
  });
});
