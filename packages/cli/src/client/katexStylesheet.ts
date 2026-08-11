import { API_PREFIX } from '../protocol';

/**
 * Stands in for `katex/dist/katex.min.css` in this bundle. See the alias in
 * `scripts/build-client.mjs`.
 *
 * Why it is not simply imported: esbuild copies the CSS reachable from a
 * *dynamic* import into the entry stylesheet as well as into the chunk, because
 * its ESM output does not fetch a chunk's stylesheet on its own. That would put
 * KaTeX's 26 kB in the first paint of every document, math or not, which is
 * exactly what loading it lazily was for.
 *
 * So the stylesheet is copied into the client directory as a file, and this
 * module - which is inside the lazily-loaded chunk - asks the browser for it the
 * first time a document contains an equation. The fonts follow from its own
 * relative URLs, and only the faces the equations actually use are fetched.
 */
const HREF = `${API_PREFIX}/client/katex.css`;

if (typeof document !== 'undefined' && !document.querySelector('link[data-mdxstudio-katex]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = HREF;
  link.setAttribute('data-mdxstudio-katex', 'true');
  document.head.appendChild(link);
}

export {};
