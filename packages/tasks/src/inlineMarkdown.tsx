/**
 * The small inline markdown a task title is allowed to contain.
 *
 * A title comes out of the fence as text, not as an mdast tree: the document's
 * own parser never sees inside a fenced block. Rather than pull a parser in for
 * one line of prose, this renders the four things people actually write in a
 * checklist - `code`, **bold**, *italic*, ~~strike~~ - plus links.
 *
 * It produces React elements, never HTML, so nothing here can inject markup.
 * The one thing that could still carry a payload is a link target, so a scheme
 * that is not http, https or mailto loses its href and renders as plain text -
 * the same trade `@mdxstudio/react` makes for a `javascript:` link.
 */

import React from 'react';

/**
 * One pass over the text. Order matters: a code span wins over everything
 * inside it, and `**` has to be tried before `*`.
 */
const INLINE =
  /(`+)([\s\S]*?)\1|\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\n]+?)\*|_([^_\n]+?)_/g;

/** Deep enough for anything a checklist line contains; a stop, not a limit. */
const MAX_DEPTH = 4;

const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/** A target that cannot run anything, or `null` for one that might. */
export function safeHref(href: string): string | null {
  const trimmed = (href ?? '').trim();
  if (!trimmed) return null;
  const scheme = /^[a-z][a-z0-9+.-]*:/i.exec(trimmed);
  if (!scheme) return trimmed; // relative, absolute path, or a bare #anchor
  return SAFE_SCHEMES.has(scheme[0].toLowerCase()) ? trimmed : null;
}

function render(text: string, depth: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  if (!text) return nodes;
  if (depth > MAX_DEPTH) return [text];

  let cursor = 0;
  let key = 0;
  const push = (node: React.ReactNode) => nodes.push(node);

  INLINE.lastIndex = 0;
  let match = INLINE.exec(text);
  while (match) {
    if (match.index > cursor) push(text.slice(cursor, match.index));
    const [whole, , code, label, href, strong, strongAlt, strike, emphasis, emphasisAlt] = match;
    const at = key;
    key += 1;

    if (code !== undefined) {
      push(<code key={at}>{code}</code>);
    } else if (label !== undefined) {
      const target = safeHref(href ?? '');
      const inner = render(label, depth + 1);
      push(
        target ? (
          <a key={at} href={target} rel="noreferrer">
            {inner}
          </a>
        ) : (
          <React.Fragment key={at}>{inner}</React.Fragment>
        )
      );
    } else if (strong !== undefined || strongAlt !== undefined) {
      push(<strong key={at}>{render((strong ?? strongAlt) as string, depth + 1)}</strong>);
    } else if (strike !== undefined) {
      push(<del key={at}>{render(strike, depth + 1)}</del>);
    } else if (emphasis !== undefined || emphasisAlt !== undefined) {
      push(<em key={at}>{render((emphasis ?? emphasisAlt) as string, depth + 1)}</em>);
    } else {
      push(whole);
    }

    cursor = match.index + whole.length;
    INLINE.lastIndex = cursor;
    match = INLINE.exec(text);
  }

  if (cursor < text.length) push(text.slice(cursor));
  return nodes;
}

/** Renders one line of inline markdown. Never throws; falls back to the text. */
export function InlineMarkdown({ text }: { text?: string }): React.ReactElement {
  const source = typeof text === 'string' ? text : '';
  try {
    return <>{render(source, 0)}</>;
  } catch {
    return <>{source}</>;
  }
}
