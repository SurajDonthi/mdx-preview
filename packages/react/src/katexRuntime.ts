/**
 * KaTeX and its stylesheet, in one module nothing imports statically.
 *
 * This is the whole reason the module exists. KaTeX is about 260 kB of
 * JavaScript plus a 23 kB stylesheet and twenty font files; a document with no
 * math must not pay for any of it. Keeping both imports here, behind the single
 * `import('./katexRuntime')` in `MathExpression`, means a bundler puts them in
 * their own chunk and the browser fetches that chunk the first time a document
 * actually contains an equation.
 *
 * The fonts stay lazy on their own: they are `@font-face` rules, so a browser
 * downloads one only when something on the page is set in it.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';

export { katex };
