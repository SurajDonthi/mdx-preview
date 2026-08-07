/** Small tree walkers shared by the core tests. */

export interface LooseTreeNode {
  type?: string;
  tagName?: string;
  name?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: LooseTreeNode[];
  [key: string]: unknown;
}

/** Every text node's value, in document order. */
export function flattenText(node: unknown): string {
  const current = node as LooseTreeNode | null | undefined;
  if (!current || typeof current !== 'object') return '';
  if (current.type === 'text') return String(current.value ?? '');
  if (!Array.isArray(current.children)) return '';
  return current.children.map(flattenText).join('');
}

/** Depth-first search for every node matching `predicate`. */
export function findAll(
  node: unknown,
  predicate: (node: LooseTreeNode) => boolean
): LooseTreeNode[] {
  const found: LooseTreeNode[] = [];
  const visit = (candidate: unknown): void => {
    const current = candidate as LooseTreeNode | null | undefined;
    if (!current || typeof current !== 'object') return;
    if (predicate(current)) found.push(current);
    if (Array.isArray(current.children)) current.children.forEach(visit);
  };
  visit(node);
  return found;
}

/** Every fenced code block in the tree, as `{ language, value }`. */
export function codeFences(tree: unknown): Array<{ language: string | null; value: string }> {
  return findAll(tree, (node) => node.type === 'element' && node.tagName === 'code').map((node) => {
    const className = node.properties?.className;
    const language = Array.isArray(className)
      ? (className.map(String).find((name) => name.startsWith('language-')) ?? null)
      : null;
    return {
      language: language ? language.replace(/^language-/, '') : null,
      value: flattenText(node),
    };
  });
}
