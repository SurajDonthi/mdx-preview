/**
 * The document's heading tree, for the outline view and the breadcrumbs.
 *
 * The headings come from `@mdxstudio/core`'s `collectHeadings()`, which is the
 * single definition of what a heading is and what its id is - the same call the
 * renderer stamps ids from, the table of contents links to and the scroll sync
 * anchors on. A second parser here would drift: `# not a heading` inside a
 * fenced code block is code, and only the real parser knows that.
 *
 * Free of `vscode` on purpose, so the nesting and the line ranges - the two
 * things that are fiddly - can be tested. `symbols.ts` maps the result onto
 * `vscode.DocumentSymbol`.
 */

import {
  collectHeadings,
  countLines,
  parseFrontmatter,
  parseMdxDocument,
} from '@mdxstudio/core';

export interface OutlineHeading {
  /** The heading's slug, as the preview stamps it. */
  id: string;
  text: string;
  /** 1 for `#`, 6 for `######`. */
  level: number;
  /** One-based line the heading itself is on. */
  line: number;
  /**
   * One-based last line the heading owns - everything up to the next heading at
   * the same level or shallower. This is what makes clicking an outline entry
   * select the whole section rather than one line.
   */
  endLine: number;
  children: OutlineHeading[];
}

interface PositionedNode {
  position?: { start?: { line?: number } };
}

/**
 * Every heading in the document, nested by level.
 *
 * Headings inside JSX children are left out for the same reason the table of
 * contents leaves them out: a component decides whether to mount its children,
 * so `<Tabs>` has at most one panel's worth of them on the page at a time and
 * an outline entry for one could point at nothing.
 */
export function documentOutline(content: string): OutlineHeading[] {
  const flat = flatHeadings(content);
  if (flat.length === 0) return [];

  const documentLines = countLines(content) + 1;

  // A heading owns everything down to the next one that is at its level or
  // shallower. Walking backwards means the answer is already known by the time
  // each heading is looked at.
  for (let index = 0; index < flat.length; index++) {
    let end = documentLines;
    for (let next = index + 1; next < flat.length; next++) {
      if (flat[next].level <= flat[index].level) {
        end = Math.max(flat[index].line, flat[next].line - 1);
        break;
      }
    }
    flat[index].endLine = end;
  }

  return nest(flat);
}

/** The headings in document order, with `endLine` not yet worked out. */
function flatHeadings(content: string): OutlineHeading[] {
  const { body } = parseFrontmatter(content);
  const lineOffset = countLines(content.slice(0, Math.max(0, content.length - body.length)));
  const { tree } = parseMdxDocument(body, { lineOffset });
  if (!tree) return [];

  const headings: OutlineHeading[] = [];

  for (const heading of collectHeadings(tree)) {
    if (heading.insideJsx) continue;

    const line = (heading.node as PositionedNode).position?.start?.line;
    if (typeof line !== 'number') continue;

    headings.push({
      id: heading.id,
      text: heading.text || heading.id,
      level: heading.level,
      line: line + lineOffset,
      endLine: line + lineOffset,
      children: [],
    });
  }

  headings.sort((left, right) => left.line - right.line);
  return headings;
}

/**
 * Turns the flat list into a tree.
 *
 * A document that starts at `##`, or jumps from `#` straight to `###`, is
 * perfectly ordinary MDX; the stack is popped by level rather than by depth so
 * neither produces an orphan.
 */
function nest(flat: OutlineHeading[]): OutlineHeading[] {
  const roots: OutlineHeading[] = [];
  const stack: OutlineHeading[] = [];

  for (const heading of flat) {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(heading);
    } else {
      stack[stack.length - 1].children.push(heading);
    }

    stack.push(heading);
  }

  return roots;
}
