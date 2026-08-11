/**
 * What the preview is allowed to run, and the content security policy that
 * enforces it.
 *
 * Deliberately free of any `vscode` import: this is the security decision, and
 * a decision that can only be exercised inside a running extension host is a
 * decision nobody tests. Everything here is a pure function of its arguments,
 * so `tests/policy.test.ts` can pin both halves down.
 *
 * ## Why trust is the input that matters
 *
 * `@mdxstudio/core`'s full expression evaluator serialises each `{...}` back to
 * JavaScript and runs it through `new Function`. That needs `'unsafe-eval'` in
 * the webview's CSP, and it means the document being previewed gets to execute
 * arbitrary code inside the editor. For the user's own files that is fine - VS
 * Code already runs their tasks and their extensions. For a repository they
 * have just cloned and not yet trusted it is not fine at all: opening the
 * folder and clicking an `.mdx` file would be enough.
 *
 * So the effective mode is the *minimum* of what the setting asks for and what
 * trust allows. An untrusted workspace is pinned to `literals`, whatever
 * `mdxstudio.expressions` says, and the CSP that goes with it grants no eval.
 */

import type { MdxExpressionMode } from '@mdxstudio/core';

/** Shown in the preview while trust is holding the renderer back. */
export const RESTRICTED_REASON =
  'Restricted mode — this workspace is not trusted, so expressions are read literally and the preview runs without eval.';

/** Normalises whatever is in the settings file to one of the two modes. */
export function configuredExpressionMode(value: unknown): MdxExpressionMode {
  return value === 'literals' ? 'literals' : 'full';
}

/**
 * The mode the renderer actually runs in.
 *
 * `literals` is the floor, never the ceiling: an untrusted workspace cannot be
 * talked back up to `full` by a setting, including one committed into the
 * repository's own `.vscode/settings.json`.
 */
export function resolveExpressionMode(value: unknown, isTrusted: boolean): MdxExpressionMode {
  const configured = configuredExpressionMode(value);
  if (!isTrusted) return 'literals';
  return configured;
}

/** True when trust - not the setting - is what pushed the preview down to `literals`. */
export function isRestrictedByTrust(value: unknown, isTrusted: boolean): boolean {
  return !isTrusted && configuredExpressionMode(value) === 'full';
}

export interface ContentSecurityPolicyOptions {
  /** The nonce the one `<script>` element carries. */
  nonce: string;
  /** `webview.cspSource` - the origin local resources are served from. */
  cspSource: string;
  /** The *effective* mode, after {@link resolveExpressionMode}. */
  expressions: MdxExpressionMode;
}

/**
 * The policy the preview document declares.
 *
 * A VS Code webview enforces exactly this meta tag - there is no outer header
 * to fight with - so everything the renderer needs has to be granted here or it
 * silently does nothing. Everything not needed is left out: `default-src
 * 'none'`, no `connect-src` at all (the preview never talks to the network),
 * and scripts must carry the nonce.
 *
 * `'unsafe-eval'` appears only for `full`, which by then already means "the
 * setting asked for it *and* the workspace is trusted".
 */
export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const { nonce, cspSource, expressions } = options;

  const scriptSrc =
    expressions === 'full' ? `'nonce-${nonce}' 'unsafe-eval'` : `'nonce-${nonce}'`;

  return [
    `default-src 'none'`,
    // Mermaid and the flow graph draw inline SVG; images come from the document's
    // own folder (through asWebviewUri), from data: URIs, or from the web.
    `img-src ${cspSource} https: data: blob:`,
    `media-src ${cspSource} https: data:`,
    `font-src ${cspSource} https: data:`,
    // `'unsafe-inline'` covers the style *attribute*: MdxRenderer stamps the
    // theme's custom properties onto its root as an inline style, and Recharts
    // and Mermaid position everything with inline styles too. The user's own
    // stylesheet is a `<link>` through asWebviewUri, so it needs nothing extra.
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src ${scriptSrc}`,
  ].join('; ');
}
