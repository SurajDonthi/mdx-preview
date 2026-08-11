import type { DocEntry } from '../protocol';

export interface DirNode {
  kind: 'dir';
  /** Path segment. */
  name: string;
  /** Full POSIX path of the directory, used as the collapse key. */
  path: string;
  children: TreeNode[];
}

export interface DocNode {
  kind: 'doc';
  name: string;
  path: string;
  doc: DocEntry;
}

export type TreeNode = DirNode | DocNode;

/**
 * Turns the flat document list into the nested tree the sidebar draws.
 *
 * A directory with exactly one child directory and nothing else is folded into
 * its parent (`guides/advanced` rather than two rows), which is what keeps a
 * deep repository's sidebar readable on a phone.
 */
export function buildTree(docs: DocEntry[]): TreeNode[] {
  const root: DirNode = { kind: 'dir', name: '', path: '', children: [] };

  for (const doc of docs) {
    const segments = doc.path.split('/');
    const fileName = segments.pop() as string;

    let parent = root;
    let prefix = '';
    for (const segment of segments) {
      prefix = prefix === '' ? segment : `${prefix}/${segment}`;
      let next = parent.children.find(
        (child): child is DirNode => child.kind === 'dir' && child.name === segment
      );
      if (!next) {
        next = { kind: 'dir', name: segment, path: prefix, children: [] };
        parent.children.push(next);
      }
      parent = next;
    }

    parent.children.push({ kind: 'doc', name: fileName, path: doc.path, doc });
  }

  return collapse(root).children;
}

function collapse(node: DirNode): DirNode {
  const children = node.children.map((child) => (child.kind === 'dir' ? collapse(child) : child));

  const [only] = children;
  if (node.name !== '' && children.length === 1 && only.kind === 'dir') {
    return { kind: 'dir', name: `${node.name}/${only.name}`, path: only.path, children: only.children };
  }

  return { ...node, children };
}

/** Every directory path in the tree - what "expand all" starts from. */
export function directoryPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const visit = (list: TreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'dir') {
        out.push(node.path);
        visit(node.children);
      }
    }
  };
  visit(nodes);
  return out;
}

/** Case-insensitive match on the file path or its title. */
export function filterDocs(docs: DocEntry[], query: string): DocEntry[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return docs;
  return docs.filter(
    (doc) =>
      doc.path.toLowerCase().includes(needle) || doc.title.toLowerCase().includes(needle)
  );
}
