/**
 * The four inline marks a task's title and description may use.
 *
 * A `tasks` fence is read by this package, not by the MDX pipeline, so nothing
 * in it has been through remark - the text arrives as text. Rather than pulling
 * a markdown parser into a webview bundle for four constructs, this file
 * handles the ones a plan actually uses and leaves everything else as the
 * literal characters the author typed.
 *
 * It never throws and never produces HTML: every branch returns React nodes, so
 * a stray `<script>` in a plan is text on the screen and nothing else.
 */
import React from 'react';

import { safeHref } from './parseTasks';

/** Code, bold, italic (both spellings) and a link, in that precedence. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)|(\[[^\][]*\]\([^()\s]*\))/g;

const LINK = /^\[([^\][]*)\]\(([^()\s]*)\)$/;

/** Renders one string of inline markdown as React nodes. */
export function InlineMarkdown({ text }: { text: string }): React.ReactElement {
  const value = typeof text === 'string' ? text : '';
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  INLINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    key += 1;

    if (match[1]) {
      nodes.push(
        <code key={key} className="mdxstudio-tasks__code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (match[2]) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (match[3] || match[4]) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = LINK.exec(token);
      const href = link ? safeHref(link[2]) : undefined;
      // An href this format will not render keeps its text and loses its link,
      // rather than disappearing from the sentence it was part of.
      nodes.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noreferrer noopener">
            {link![1] || href}
          </a>
        ) : (
          (link?.[1] ?? token)
        )
      );
    }

    cursor = match.index + token.length;
  }

  if (cursor < value.length) nodes.push(value.slice(cursor));
  return <>{nodes}</>;
}
