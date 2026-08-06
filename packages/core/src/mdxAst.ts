/**
 * Parsing a document with the real MDX parser.
 *
 * `parseMdxDocument()` runs the body through
 * `remark-parse` -> `remark-gfm` -> `remark-mdx` -> `remark-rehype`, keeping the
 * MDX nodes intact, and hands back a hast tree that a renderer can turn into
 * React elements directly. Nothing is compiled to JavaScript and nothing is
 * evaluated here.
 *
 * Two things happen on the way out:
 *
 * - **Sanitising.** Nodes the renderer cannot use - `import`/`export`, empty or
 *   comment-only expressions, attributes whose expression the parser could not
 *   attach an ESTree to - are dropped and reported as diagnostics rather than
 *   left to blow up mid-render.
 * - **Slot registration.** Every remaining expression is recorded in
 *   {@link MdxDocumentAst.slots}, keyed by the identity of its ESTree
 *   expression node. The renderer's evaluator uses that map to tell an
 *   author-written expression apart from the synthetic identifier lookups
 *   `hast-util-to-jsx-runtime` performs to resolve `<ComponentName>`.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMdx from 'remark-mdx';
import remarkRehype from 'remark-rehype';
import type { Root as HastRoot } from 'hast';

/** A one-based position in the document the user is editing. */
export interface MdxPoint {
  line: number;
  column: number;
}

/** A parse failure, located when the parser knew where it happened. */
export interface MdxParseError {
  /** Human-readable reason, without any position prefix. */
  message: string;
  point: MdxPoint | null;
}

/** Something skipped during parsing, worth telling the author about. */
export interface MdxDiagnostic {
  message: string;
  point: MdxPoint | null;
}

/** Where an expression came from, which decides how its value is used. */
export type MdxExpressionSlotKind = 'attribute' | 'spread' | 'flow' | 'text';

/** One `{...}` in the document, ready to be evaluated by the renderer. */
export interface MdxExpressionSlot {
  kind: MdxExpressionSlotKind;
  /** Attribute name, or the element name for a body expression. */
  label: string;
  point: MdxPoint | null;
}

export interface MdxDocumentAst {
  /** The hast tree, or `null` when the document could not be parsed. */
  tree: HastRoot | null;
  error: MdxParseError | null;
  diagnostics: MdxDiagnostic[];
  /** ESTree expression node -> what the document used it for. */
  slots: Map<object, MdxExpressionSlot>;
}

export interface ParseMdxOptions {
  /**
   * Added to every reported line so positions match the file the user is
   * editing rather than the frontmatter-stripped body.
   */
  lineOffset?: number;
}

// MDX nodes must survive the trip to hast; `remark-rehype` would otherwise drop
// them as unknown.
const MDX_NODE_TYPES = [
  'mdxFlowExpression',
  'mdxJsxFlowElement',
  'mdxJsxTextElement',
  'mdxTextExpression',
  'mdxjsEsm',
] as const;

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMdx)
  .use(remarkRehype, { passThrough: [...MDX_NODE_TYPES] })
  .freeze();

type LooseNode = {
  type: string;
  name?: string | null;
  children?: LooseNode[];
  attributes?: LooseAttribute[];
  data?: { estree?: { type: string; body?: unknown[] } };
  position?: { start?: { line?: number; column?: number } };
};

type LooseAttribute = {
  type: string;
  name?: string;
  value?: unknown;
  data?: { estree?: { type: string; body?: unknown[] } };
  position?: { start?: { line?: number; column?: number } };
};

/**
 * Parses an MDX body (frontmatter already removed) into a hast tree.
 *
 * Never throws: a syntax error comes back as {@link MdxDocumentAst.error} with
 * the line and column the parser reported.
 */
export function parseMdxDocument(body: string, options: ParseMdxOptions = {}): MdxDocumentAst {
  const lineOffset = options.lineOffset ?? 0;
  const diagnostics: MdxDiagnostic[] = [];
  const slots = new Map<object, MdxExpressionSlot>();

  let tree: HastRoot;
  try {
    tree = processor.runSync(processor.parse(body)) as HastRoot;
  } catch (error) {
    return { tree: null, error: toParseError(error, lineOffset), diagnostics, slots };
  }

  try {
    sanitize(tree as unknown as LooseNode, { diagnostics, slots, lineOffset });
  } catch (error) {
    return { tree: null, error: toParseError(error, lineOffset), diagnostics, slots };
  }

  return { tree, error: null, diagnostics, slots };
}

interface SanitizeContext {
  diagnostics: MdxDiagnostic[];
  slots: Map<object, MdxExpressionSlot>;
  lineOffset: number;
}

function pointOf(node: { position?: { start?: { line?: number; column?: number } } } | undefined, lineOffset: number): MdxPoint | null {
  const start = node?.position?.start;
  if (!start || typeof start.line !== 'number' || typeof start.column !== 'number') return null;
  return { line: start.line + lineOffset, column: start.column };
}

/** Returns the sole expression of an MDX ESTree program, or `null`. */
function soleExpression(estree: { type: string; body?: unknown[] } | undefined): object | null {
  const body = estree?.body;
  if (!Array.isArray(body) || body.length !== 1) return null;
  const statement = body[0] as { type?: string; expression?: unknown } | undefined;
  if (!statement || statement.type !== 'ExpressionStatement') return null;
  const expression = statement.expression;
  return expression && typeof expression === 'object' ? (expression as object) : null;
}

/**
 * Walks the tree, removing what cannot be rendered and registering every
 * expression the renderer will be asked to evaluate.
 */
function sanitize(node: LooseNode, context: SanitizeContext): void {
  if (node.attributes) {
    node.attributes = node.attributes.filter((attribute) =>
      keepAttribute(node, attribute, context)
    );
  }

  if (!Array.isArray(node.children)) return;

  const kept: LooseNode[] = [];
  for (const child of node.children) {
    if (!child || typeof child.type !== 'string') continue;

    if (child.type === 'mdxjsEsm') {
      context.diagnostics.push({
        message: 'import/export is not supported in a rendered document and was skipped',
        point: pointOf(child, context.lineOffset),
      });
      continue;
    }

    if (child.type === 'mdxFlowExpression' || child.type === 'mdxTextExpression') {
      const expression = soleExpression(child.data?.estree);
      if (!expression) {
        // `{}` and `{/* comment */}` carry no expression at all and are simply
        // dropped; a statement has no value to render and is worth reporting.
        if ((child.data?.estree?.body?.length ?? 0) > 0) {
          context.diagnostics.push({
            message: 'an expression that is not a value was skipped',
            point: pointOf(child, context.lineOffset),
          });
        }
        continue;
      }
      context.slots.set(expression, {
        kind: child.type === 'mdxFlowExpression' ? 'flow' : 'text',
        label: 'expression',
        point: pointOf(child, context.lineOffset),
      });
      kept.push(child);
      sanitize(child, context);
      continue;
    }

    kept.push(child);
    sanitize(child, context);
  }

  node.children = kept;
}

function keepAttribute(
  element: LooseNode,
  attribute: LooseAttribute,
  context: SanitizeContext
): boolean {
  const elementName = element.name ?? 'element';

  if (attribute.type === 'mdxJsxExpressionAttribute') {
    // `{...something}`. The runtime expects exactly one spread in one object.
    const expression = soleExpression(attribute.data?.estree) as
      | { type?: string; properties?: Array<{ type?: string; argument?: unknown }> }
      | null;
    const property = expression?.type === 'ObjectExpression' ? expression.properties?.[0] : undefined;
    const argument = property?.type === 'SpreadElement' ? property.argument : undefined;

    if (!argument || typeof argument !== 'object') {
      context.diagnostics.push({
        message: `<${elementName}>: could not read a spread attribute, so it was skipped`,
        point: pointOf(attribute, context.lineOffset) ?? pointOf(element, context.lineOffset),
      });
      return false;
    }

    context.slots.set(argument as object, {
      kind: 'spread',
      label: `<${elementName}> {...}`,
      point: pointOf(attribute, context.lineOffset) ?? pointOf(element, context.lineOffset),
    });
    return true;
  }

  const value = attribute.value;

  // A plain string attribute, or a bare boolean one (`value === null`).
  if (value === null || value === undefined || typeof value === 'string') return true;

  const expression = soleExpression((value as LooseAttribute).data?.estree);
  if (!expression) {
    context.diagnostics.push({
      message: `<${elementName}> ${attribute.name ?? 'attribute'}: the expression is empty or is not a value, so the attribute was omitted`,
      point: pointOf(attribute, context.lineOffset) ?? pointOf(element, context.lineOffset),
    });
    return false;
  }

  context.slots.set(expression, {
    kind: 'attribute',
    label: `<${elementName}> ${attribute.name ?? 'attribute'}`,
    point: pointOf(value as LooseAttribute, context.lineOffset) ?? pointOf(element, context.lineOffset),
  });
  return true;
}

// Micromark reports positions as fields on a `VFileMessage`; the MDX JSX
// utilities throw plain errors with the position written into the text instead.
const POSITION_IN_MESSAGE = /\s*\((\d+):(\d+)(?:-\d+:\d+)?\)/;

/** Turns whatever unified threw into a located, printable error. */
function toParseError(error: unknown, lineOffset: number): MdxParseError {
  const candidate = error as
    | { reason?: string; message?: string; line?: number | null; column?: number | null }
    | undefined;

  let message =
    (typeof candidate?.reason === 'string' && candidate.reason) ||
    (typeof candidate?.message === 'string' && candidate.message) ||
    'Could not parse this document';

  let line = typeof candidate?.line === 'number' ? candidate.line : null;
  let column = typeof candidate?.column === 'number' ? candidate.column : null;

  if (line === null || column === null) {
    const match = POSITION_IN_MESSAGE.exec(message);
    if (match) {
      line = Number(match[1]);
      column = Number(match[2]);
      // The position moves into the error's own fields, so drop the duplicate
      // (and un-offset) copy left in the text.
      message = (message.slice(0, match.index) + message.slice(match.index + match[0].length)).trim();
    }
  }

  return {
    message,
    point: line !== null && column !== null ? { line: line + lineOffset, column } : null,
  };
}

/** `Line 12, Column 3 - message`, or just the message when unlocated. */
export function formatMdxParseError(error: MdxParseError): string {
  if (!error.point) return error.message;
  return `Line ${error.point.line}, Column ${error.point.column} - ${error.message}`;
}

/** Number of lines a frontmatter block occupied, so positions can be shifted. */
export function countLines(text: string): number {
  let lines = 0;
  for (let index = 0; index < text.length; index++) {
    if (text.charCodeAt(index) === 10) lines++;
  }
  return lines;
}
