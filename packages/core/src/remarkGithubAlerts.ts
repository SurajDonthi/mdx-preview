/**
 * GitHub's alert blockquotes.
 *
 *     > [!NOTE]
 *     > Useful information.
 *
 * The five markers GitHub defines - `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and
 * `CAUTION` - become `<Callout>` elements, which is the callout the packages
 * already ship. Emitting the component rather than a second set of styled
 * elements is deliberate: an alert and a hand-written `<Callout type="warning">`
 * then look identical, are themed by the same `--mdxstudio-callout-*`
 * properties, and there is only one thing to restyle.
 *
 * The conversion produces an `mdxJsxFlowElement`, the same node the MDX parser
 * produces for a tag the author typed, so everything downstream - the
 * sanitiser, the renderer, the registry lookup - treats it exactly like one.
 * A document rendered against a registry with no `Callout` in it gets the usual
 * unknown-component notice with the alert's body intact, rather than losing the
 * text.
 *
 * Anything that is not one of the five markers stays an ordinary blockquote, as
 * it does on GitHub: `> [!MAYBE]` is quoted prose, not a broken alert.
 */

/** Marker -> the `Callout` variant it maps onto, and the title GitHub shows. */
const ALERTS: Record<string, { type: string; title: string }> = {
  note: { type: 'note', title: 'Note' },
  tip: { type: 'success', title: 'Tip' },
  important: { type: 'info', title: 'Important' },
  warning: { type: 'warning', title: 'Warning' },
  caution: { type: 'error', title: 'Caution' },
};

/**
 * The marker has to be alone on the first line. `> [!NOTE] and more` is not an
 * alert on GitHub either - the whole quote stays a quote - and matching it here
 * would silently swallow the author's text into a title.
 */
const MARKER = /^\[!([A-Za-z]+)\][ \t]*(?:\r?\n|$)/;

type LooseNode = {
  type: string;
  value?: unknown;
  children?: LooseNode[];
  position?: unknown;
};

function alertFor(blockquote: LooseNode): LooseNode | null {
  const paragraph = blockquote.children?.[0];
  if (!paragraph || paragraph.type !== 'paragraph') return null;

  const first = paragraph.children?.[0];
  if (!first || first.type !== 'text' || typeof first.value !== 'string') return null;

  const match = MARKER.exec(first.value);
  if (!match) return null;

  const alert = ALERTS[match[1].toLowerCase()];
  if (!alert) return null;

  const rest = first.value.slice(match[0].length);
  const body = [...(blockquote.children ?? [])];

  if (rest === '') {
    // The marker was the whole line. Drop the text node, and the paragraph with
    // it when the marker was all the paragraph held.
    const siblings = (paragraph.children ?? []).slice(1);
    if (siblings.length === 0) body.shift();
    else body[0] = { ...paragraph, children: siblings };
  } else {
    body[0] = { ...paragraph, children: [{ ...first, value: rest }, ...(paragraph.children ?? []).slice(1)] };
  }

  return {
    type: 'mdxJsxFlowElement',
    name: 'Callout',
    attributes: [
      { type: 'mdxJsxAttribute', name: 'type', value: alert.type },
      { type: 'mdxJsxAttribute', name: 'title', value: alert.title },
    ],
    children: body,
    position: blockquote.position,
  } as LooseNode;
}

/**
 * Rewrites every alert blockquote in the tree, at any depth: an alert nested in
 * a list item or inside another quote is still an alert.
 */
export function remarkGithubAlerts() {
  return (tree: unknown): void => {
    const visit = (node: LooseNode): void => {
      if (!Array.isArray(node.children)) return;

      const next: LooseNode[] = [];
      for (const child of node.children) {
        if (!child || typeof child.type !== 'string') continue;
        const converted = child.type === 'blockquote' ? alertFor(child) : null;
        const kept = converted ?? child;
        visit(kept);
        next.push(kept);
      }
      node.children = next;
    };

    visit(tree as LooseNode);
  };
}
