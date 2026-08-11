/**
 * `$inline$` and `$$block$$` math.
 *
 * `remark-math` does the lexing - it is the same extension GitHub, VS Code and
 * MDX itself use, and it gets the awkward parts right (a `\$` escape is never a
 * marker, a `$` inside a code span or a fenced block is not either).
 *
 * Two things happen on top of it here.
 *
 * **Prose that merely mentions money is not math.** `it costs $5 and $10` has
 * two dollar signs in one paragraph, which the extension is happy to read as
 * `$5 and $` around the content `5 and `. {@link remarkDollarMathGuard} puts
 * those back as the text the author typed, using the rule Pandoc uses: an
 * opening `$` may not be followed by whitespace, a closing `$` may not be
 * preceded by whitespace, and a closing `$` may not be followed by a digit.
 * Explicit `$$...$$` is left alone - nobody writes that by accident.
 *
 * **Math becomes a component, not a code block.** Left to itself
 * `remark-rehype` turns a math node into `<code class="language-math">`, which
 * this renderer would then syntax-highlight as a code block. The handlers in
 * {@link mathHastHandlers} emit an MDX element instead - the same node the
 * parser produces for a tag the author typed - so the renderer mounts a real
 * component and can load KaTeX only for documents that actually contain math.
 */

/**
 * The tag math is rendered through.
 *
 * Not `Math`: every registered component name is bound as a variable for the
 * `{...}` expressions in a document, so a component called `Math` would shadow
 * the JavaScript global and quietly break `{Math.round(x)}`.
 */
export const MATH_COMPONENT = 'MathExpression';

type LooseNode = {
  type: string;
  value?: unknown;
  children?: LooseNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

/** Builds the MDX element one math node becomes. */
function mathElement(node: LooseNode, display: boolean): unknown {
  const attributes: unknown[] = [
    { type: 'mdxJsxAttribute', name: 'tex', value: String(node.value ?? '') },
  ];
  // A bare attribute - `<MathExpression display>` - which the renderer reads as
  // `true`, exactly as it would from a hand-written tag.
  if (display) attributes.push({ type: 'mdxJsxAttribute', name: 'display', value: null });

  return {
    type: display ? 'mdxJsxFlowElement' : 'mdxJsxTextElement',
    name: MATH_COMPONENT,
    attributes,
    children: [],
    position: node.position,
  };
}

/**
 * `remark-rehype` handlers for the two node types `remark-math` produces.
 *
 * Typed loosely on purpose: `mdast-util-to-hast` expects a handler to return a
 * hast node, and these return MDX nodes, which the tree carries through
 * untouched because `remark-rehype` was told to pass them through.
 */
export const mathHastHandlers: Record<string, (state: unknown, node: never) => unknown> = {
  inlineMath: (_state: unknown, node: never) => mathElement(node as LooseNode, false),
  math: (_state: unknown, node: never) => mathElement(node as LooseNode, true),
};

/** True when the source span reads like math rather than like two prices. */
function looksLikeMath(inner: string, following: string): boolean {
  if (inner === '') return false;
  if (/^\s/.test(inner)) return false;
  if (/\s$/.test(inner)) return false;
  if (/^[0-9]/.test(following)) return false;
  return true;
}

/**
 * Turns single-dollar spans that are not really math back into text.
 *
 * The original source is what goes back into the tree, taken from the node's
 * own offsets, so the paragraph reads exactly as it was written - including the
 * dollar signs the math extension had consumed.
 */
export function remarkDollarMathGuard() {
  return (tree: unknown, file: { value?: unknown }): void => {
    const source = typeof file?.value === 'string' ? file.value : String(file?.value ?? '');
    if (source === '') return;

    const visit = (node: LooseNode): void => {
      if (!Array.isArray(node.children)) return;

      const next: LooseNode[] = [];
      for (const child of node.children) {
        if (!child || typeof child.type !== 'string') continue;

        if (child.type === 'inlineMath') {
          const start = child.position?.start?.offset;
          const end = child.position?.end?.offset;
          const raw = typeof start === 'number' && typeof end === 'number' ? source.slice(start, end) : '';

          // Only the one-dollar form is ambiguous, and only when the offsets
          // were reliable enough to quote the source back.
          if (raw.startsWith('$') && !raw.startsWith('$$') && raw.endsWith('$')) {
            if (!looksLikeMath(raw.slice(1, -1), source.slice(end as number, (end as number) + 1))) {
              next.push({ type: 'text', value: raw, position: child.position });
              continue;
            }
          }
        }

        visit(child);
        next.push(child);
      }
      node.children = next;
    };

    visit(tree as LooseNode);
  };
}
