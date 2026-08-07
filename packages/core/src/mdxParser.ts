import { load as parseYaml } from 'js-yaml';
import { Frontmatter, HeaderItem, DocumentStats } from './types';
import { countLines, parseMdxDocument } from './mdxAst';

/**
 * Extracts YAML frontmatter and markdown body from MDX content string
 */
export function parseFrontmatter(content: string): {
  frontmatter: Frontmatter | null;
  body: string;
  rawYaml: string | null;
} {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return {
      frontmatter: null,
      body: content,
      rawYaml: null,
    };
  }

  const rawYaml = match[1];
  const body = content.slice(match[0].length);

  try {
    const parsed = parseYaml(rawYaml);
    if (typeof parsed === 'object' && parsed !== null) {
      return {
        frontmatter: parsed as Frontmatter,
        body,
        rawYaml,
      };
    }
  } catch (e) {
    console.warn('Failed to parse YAML frontmatter:', e);
  }

  return {
    frontmatter: null,
    body,
    rawYaml,
  };
}

/**
 * Generates URL-friendly slug for header IDs
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Loose view of a hast/MDX node, enough to walk one looking for headings. */
type HeadingWalkNode = {
  type?: string;
  tagName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: HeadingWalkNode[];
};

const HEADING_TAG_NAMES = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/** JSX in the document; its children are rendered by the component, not the page. */
const MDX_JSX_ELEMENT_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

/** Deepest level a table of contents entry is shown at. */
const MAX_TOC_LEVEL = 4;

export interface DocumentHeading extends HeaderItem {
  /** The heading element itself, so a renderer can stamp {@link HeaderItem.id} on it. */
  node: object;
  /** True when the heading sits inside the children of a JSX element. */
  insideJsx: boolean;
}

/** Plain text of a hast subtree, used for heading slugs. */
function hastText(node: HeadingWalkNode | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return String(node.value ?? '');
  if (Array.isArray(node.children)) return node.children.map(hastText).join('');
  return '';
}

/**
 * Every heading in a parsed document, in document order, with the id it is
 * addressed by.
 *
 * This is the single definition of a heading's id: the renderer stamps these
 * onto the tree it renders and the table of contents links to them, so the two
 * cannot drift. Ids are slugs of the heading's text, de-duplicated by appending
 * the number of earlier headings that produced the same slug.
 */
export function collectHeadings(tree: unknown): DocumentHeading[] {
  const headings: DocumentHeading[] = [];
  if (!tree || typeof tree !== 'object') return headings;

  const slugCounts = new Map<string, number>();

  const visit = (node: HeadingWalkNode, insideJsx: boolean): void => {
    if (node.type === 'element' && node.tagName && HEADING_TAG_NAMES.has(node.tagName)) {
      const text = hastText(node).trim();
      const base = slugify(text) || 'heading';
      const seen = slugCounts.get(base) ?? 0;
      slugCounts.set(base, seen + 1);

      headings.push({
        node: node as object,
        id: seen === 0 ? base : `${base}-${seen}`,
        text,
        level: Number(node.tagName.slice(1)),
        insideJsx,
      });
    }

    if (Array.isArray(node.children)) {
      const childrenAreJsx = insideJsx || MDX_JSX_ELEMENT_TYPES.has(String(node.type));
      for (const child of node.children) {
        if (child && typeof child === 'object') visit(child, childrenAreJsx);
      }
    }
  };

  visit(tree as HeadingWalkNode, false);
  return headings;
}

/**
 * The document's headings, for the table of contents.
 *
 * The document is parsed with the same parser the renderer uses, so every entry
 * points at an id the renderer really emits - a `# comment` line inside a
 * fenced code block is code, not a heading, and never reaches the outline.
 *
 * Headings inside JSX children are left out. A component decides for itself
 * whether and when to render its children - `<Tabs>` mounts only the active
 * panel - so an entry for one could address an element that is not on the page.
 *
 * Parsing is shared with the renderer through {@link parseMdxDocument}'s cache,
 * so calling this on every keystroke costs one parse, not two.
 */
export function extractHeadings(content: string): HeaderItem[] {
  // Clean frontmatter first so headers in frontmatter aren't included
  const { body } = parseFrontmatter(content);

  // The renderer parses the same body with the same offset; matching it here is
  // what lets both of them share one parse.
  const lineOffset = countLines(content.slice(0, Math.max(0, content.length - body.length)));
  const { tree } = parseMdxDocument(body, { lineOffset });

  return collectHeadings(tree)
    .filter((heading) => !heading.insideJsx && heading.level <= MAX_TOC_LEVEL)
    .map(({ id, text, level }) => ({ id, text, level }));
}

/**
 * Calculates document stats (word count, reading time, character count)
 */
export function calculateDocumentStats(content: string): DocumentStats {
  const { body } = parseFrontmatter(content);
  
  // Strip code blocks and HTML/JSX tags for accurate word count
  const cleanBody = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();

  const words = cleanBody ? cleanBody.split(/\s+/).filter(Boolean).length : 0;
  const characters = body.length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 200));
  const headingsCount = extractHeadings(content).length;

  return {
    words,
    characters,
    readingTimeMinutes,
    headingsCount,
  };
}
