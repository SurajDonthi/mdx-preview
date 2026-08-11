import { describe, expect, it } from 'vitest';

import type { DocEntry } from '../src/protocol';
import { buildTree, directoryPaths, filterDocs } from '../src/client/tree';

const doc = (docPath: string, title = docPath): DocEntry => ({
  path: docPath,
  title,
  mtimeMs: 0,
  size: 0,
});

describe('buildTree', () => {
  it('nests documents under their directories', () => {
    const tree = buildTree([doc('a.mdx'), doc('guides/b.mdx'), doc('guides/c.mdx')]);

    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ kind: 'doc', path: 'a.mdx' });
    expect(tree[1]).toMatchObject({ kind: 'dir', name: 'guides' });
    expect(tree[1].kind === 'dir' && tree[1].children).toHaveLength(2);
  });

  it('folds a directory that only holds another directory', () => {
    const tree = buildTree([doc('docs/guides/deep/only.mdx')]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ kind: 'dir', name: 'docs/guides/deep' });
    expect(tree[0].kind === 'dir' && tree[0].children[0]).toMatchObject({ path: 'docs/guides/deep/only.mdx' });
  });

  it('stops folding as soon as a directory has a document of its own', () => {
    const tree = buildTree([doc('docs/index.mdx'), doc('docs/guides/a.mdx')]);
    expect(tree[0]).toMatchObject({ kind: 'dir', name: 'docs' });
  });

  it('keeps the order it was given', () => {
    const tree = buildTree([doc('b.mdx'), doc('a.mdx')]);
    expect(tree.map((node) => node.path)).toEqual(['b.mdx', 'a.mdx']);
  });
});

describe('directoryPaths', () => {
  it('lists every directory, at every depth', () => {
    const tree = buildTree([doc('one/a.mdx'), doc('one/two/b.mdx'), doc('one/c.mdx')]);
    expect(directoryPaths(tree)).toEqual(['one', 'one/two']);
  });
});

describe('filterDocs', () => {
  const docs = [doc('guides/setup.mdx', 'Installing'), doc('api.mdx', 'API reference')];

  it('matches the path or the title, case-insensitively', () => {
    expect(filterDocs(docs, 'GUIDES').map((entry) => entry.path)).toEqual(['guides/setup.mdx']);
    expect(filterDocs(docs, 'install').map((entry) => entry.path)).toEqual(['guides/setup.mdx']);
    expect(filterDocs(docs, 'reference').map((entry) => entry.path)).toEqual(['api.mdx']);
  });

  it('returns everything for an empty query', () => {
    expect(filterDocs(docs, '   ')).toHaveLength(2);
  });
});
