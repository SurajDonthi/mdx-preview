import React, { useEffect, useState } from 'react';

/**
 * One `$...$` or `$$...$$` from the document, typeset by KaTeX.
 *
 * The parser turns math into this component rather than into markup so that
 * KaTeX can be loaded on demand - see `./katexRuntime`. Until the chunk arrives
 * (and if it never does) the raw TeX is what is on the page, which is the same
 * thing a reader would see in the source file: legible, and never a blank gap
 * where an equation should be.
 *
 * `MathExpression`, not `Math`: every registered component name is bound as a
 * variable for the `{...}` expressions in a document, and a component called
 * `Math` would shadow the JavaScript global.
 */

type Katex = typeof import('./katexRuntime')['katex'];

/**
 * One load, shared by every equation on the page. The resolved module is kept
 * as well, so an equation that mounts after the chunk has arrived typesets in
 * its first render instead of flashing raw TeX.
 */
let katexPromise: Promise<Katex> | null = null;
let loadedKatex: Katex | null = null;

function loadKatex(): Promise<Katex> {
  katexPromise ??= import('./katexRuntime').then((module) => {
    loadedKatex = module.katex;
    return module.katex;
  });
  return katexPromise;
}

/** KaTeX's own HTML, or `null` when it could not render this source. */
function typeset(katex: Katex, tex: string, display: boolean): string | null {
  try {
    return katex.renderToString(tex, {
      displayMode: display,
      // A bad expression is an authoring mistake, not a crash: KaTeX renders it
      // in its error colour with the reason in the title attribute.
      throwOnError: false,
      // `trust` stays off, so `\href` and `\url` in a document cannot become
      // links to anywhere the renderer would not otherwise go.
      trust: false,
      output: 'htmlAndMathml',
    });
  } catch {
    return null;
  }
}

export interface MathExpressionProps {
  /** The TeX source, as the parser read it out of the document. */
  tex?: string;
  /** Display (block) math rather than inline. */
  display?: boolean;
  children?: React.ReactNode;
}

export function MathExpression({ tex, display = false, children }: MathExpressionProps) {
  const source = (
    tex ??
    React.Children.toArray(children)
      .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
      .join('')
  ).trim();

  const [html, setHtml] = useState<string | null>(() =>
    loadedKatex ? typeset(loadedKatex, source, display) : null
  );

  useEffect(() => {
    if (source === '') return;

    let active = true;
    void loadKatex().then((katex) => {
      if (active) setHtml(typeset(katex, source, display));
    });

    return () => {
      active = false;
    };
  }, [source, display]);

  const className = `mdxstudio-math mdxstudio-math--${display ? 'display' : 'inline'}`;
  const Tag = display ? 'div' : 'span';

  if (html === null) {
    return (
      <Tag className={`${className} mdxstudio-math--pending`} data-math-pending="true">
        {source}
      </Tag>
    );
  }

  // KaTeX built this string from the TeX above with `trust: false`; nothing the
  // document wrote reaches the output as markup.
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
