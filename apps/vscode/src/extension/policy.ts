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
 *
 * `mdxstudio.config` answers to the same rule for the same reason, only more
 * bluntly. Loading a workspace's `mdxstudio.config.js` means running that
 * workspace's JavaScript in the preview - not an expression lifted out of a
 * document, a whole module of the project's own code. There is no reduced form
 * of that to fall back to, so an untrusted workspace does not load one at all.
 */

import type { MdxExpressionMode } from '@mdxstudio/core';

/** Shown in the preview while trust is holding the renderer back. */
export const RESTRICTED_REASON =
  'Restricted mode — this workspace is not trusted, so expressions are read literally and the preview runs without eval.';

/** What `mdxstudio.config` is set to when it means "never load one". */
export const CONFIG_OFF = 'off';

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

/** What `mdxstudio.config` asks for, before trust is applied. */
export interface ConfigPolicy {
  /** Whether the preview may load a config file at all. */
  enabled: boolean;
  /**
   * The file the setting named, or `null` when the workspace folder is to be
   * searched for one instead.
   *
   * Set whether or not the file may be loaded: an untrusted workspace still
   * gets told *which* config it is not loading, and that has to be the file the
   * setting names rather than whatever happens to be lying in the folder.
   */
  path: string | null;
  /** The setting says `off`, so no file should even be looked for. */
  off: boolean;
  /** Trust - not the setting - is what turned it off. */
  restricted: boolean;
}

/** Normalises whatever is in the settings file to a path, `off`, or "search". */
export function configuredConfigSetting(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.toLowerCase() === CONFIG_OFF ? CONFIG_OFF : trimmed;
}

/**
 * Whether a config file may be loaded, and which one.
 *
 * Trust is a floor here too, and a harder one than it is for expressions: there
 * is no restricted way to run a module, so `enabled` is false in an untrusted
 * workspace whatever the setting says - including a setting committed into the
 * repository's own `.vscode/settings.json`, which is exactly the file an
 * attacker would put it in. (VS Code also refuses workspace-scoped values for
 * `mdxstudio.config` while untrusted, because it is listed in
 * `capabilities.untrustedWorkspaces.restrictedConfigurations`; this does not
 * rely on that, because a decision that depends on the platform remembering to
 * make it for us is a decision that is one settings-schema edit from being
 * wrong.)
 *
 * `off` is honoured in both directions: a user who has turned this off is not
 * being restricted by trust, and nothing should look for a file to tell them
 * about.
 */
export function resolveConfigPolicy(value: unknown, isTrusted: boolean): ConfigPolicy {
  const setting = configuredConfigSetting(value);
  const off = setting === CONFIG_OFF;

  return {
    enabled: !off && isTrusted,
    path: off || setting === '' ? null : setting,
    off,
    restricted: !off && !isTrusted,
  };
}

/**
 * The banner at the top of the preview, or `null` when nothing is being held
 * back.
 *
 * Both halves can be true at once, and a reader who is told about only one of
 * them will spend the afternoon on the other. `configFile` is the name of the
 * file that was found and skipped - naming it is the difference between "why is
 * my component missing" and "ah, that file".
 */
export function restrictionMessage(held: {
  expressions: boolean;
  configFile: string | null;
}): string | null {
  const { expressions, configFile } = held;

  if (expressions && configFile) {
    return (
      'Restricted mode — this workspace is not trusted, so expressions are read ' +
      `literally, the preview runs without eval, and ${configFile} is not loaded.`
    );
  }
  if (expressions) return RESTRICTED_REASON;
  if (configFile) {
    return `Restricted mode — this workspace is not trusted, so ${configFile} is not loaded.`;
  }
  return null;
}

export interface ContentSecurityPolicyOptions {
  /** The nonce the one `<script>` element carries. */
  nonce: string;
  /** `webview.cspSource` - the origin local resources are served from. */
  cspSource: string;
  /** The *effective* mode, after {@link resolveExpressionMode}. */
  expressions: MdxExpressionMode;
  /**
   * Whether this page is going to import a config file. False unless one was
   * actually found *and* {@link resolveConfigPolicy} allows it.
   */
  loadsConfig?: boolean;
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
 *
 * `cspSource` appears in `script-src` only for a page that is about to import
 * `mdxstudio.config.js`, which means the same thing: a workspace that is
 * trusted and that actually has one. It is the narrowest grant that works,
 * because the config is a module on disk and a module on disk is fetched from
 * exactly that origin - the one the preview's own bundle and the user's
 * stylesheet already come from, restricted further by `localResourceRoots`.
 * The alternatives were all worse: `blob:` or `data:` in `script-src` is a
 * general-purpose code channel, and relying on the nonce being inherited by a
 * dynamic import is a bet on the Chromium build inside whichever VS Code the
 * reader happens to be running.
 */
export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions): string {
  const { nonce, cspSource, expressions } = options;

  const scriptSrc = [
    `'nonce-${nonce}'`,
    ...(options.loadsConfig ? [cspSource] : []),
    ...(expressions === 'full' ? [`'unsafe-eval'`] : []),
  ].join(' ');

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
