import { describe, expect, it } from 'vitest';

import {
  buildContentSecurityPolicy,
  configuredExpressionMode,
  isRestrictedByTrust,
  resolveExpressionMode,
} from '../src/extension/policy';

/*
 * The security decision, pinned down.
 *
 * `full` means the preview compiles the document's `{...}` expressions with
 * `new Function`, which needs `'unsafe-eval'` in the webview's CSP - so in an
 * untrusted workspace, opening a freshly cloned repository and clicking an
 * `.mdx` file would run that repository's JavaScript inside the editor. The
 * whole of that is decided by the two functions below, so the two functions
 * below are what these tests are for.
 */

describe('resolveExpressionMode', () => {
  it('honours the setting in a trusted workspace', () => {
    expect(resolveExpressionMode('full', true)).toBe('full');
    expect(resolveExpressionMode('literals', true)).toBe('literals');
  });

  it('forces literals in an untrusted workspace, whatever the setting says', () => {
    expect(resolveExpressionMode('full', false)).toBe('literals');
    expect(resolveExpressionMode('literals', false)).toBe('literals');
  });

  it('cannot be talked back up to full by a workspace settings file', () => {
    // The values a hostile `.vscode/settings.json` might try.
    for (const value of ['full', 'FULL', ' full ', true, 1, {}, ['full']]) {
      expect(resolveExpressionMode(value, false)).toBe('literals');
    }
  });

  it('defaults to full for anything unrecognised, when trusted', () => {
    expect(configuredExpressionMode(undefined)).toBe('full');
    expect(configuredExpressionMode('nonsense')).toBe('full');
    expect(resolveExpressionMode(undefined, true)).toBe('full');
  });
});

describe('isRestrictedByTrust', () => {
  it('is true only when trust is what lowered the mode', () => {
    expect(isRestrictedByTrust('full', false)).toBe(true);
    // The user asked for `literals`; nothing is being held back from them.
    expect(isRestrictedByTrust('literals', false)).toBe(false);
    expect(isRestrictedByTrust('full', true)).toBe(false);
    expect(isRestrictedByTrust('literals', true)).toBe(false);
  });
});

describe('buildContentSecurityPolicy', () => {
  const base = { nonce: 'abc123', cspSource: 'vscode-resource://x' };

  it('grants unsafe-eval only for full', () => {
    const full = buildContentSecurityPolicy({ ...base, expressions: 'full' });
    expect(full).toContain("script-src 'nonce-abc123' 'unsafe-eval'");
  });

  it('never grants unsafe-eval for literals', () => {
    const literals = buildContentSecurityPolicy({ ...base, expressions: 'literals' });
    expect(literals).not.toContain('unsafe-eval');
    expect(literals).toContain("script-src 'nonce-abc123'");
  });

  it('is the same policy in both modes apart from the eval grant', () => {
    const full = buildContentSecurityPolicy({ ...base, expressions: 'full' });
    const literals = buildContentSecurityPolicy({ ...base, expressions: 'literals' });
    expect(full.replace(" 'unsafe-eval'", '')).toBe(literals);
  });

  it('denies everything not named, and never opens a network channel', () => {
    for (const expressions of ['full', 'literals'] as const) {
      const csp = buildContentSecurityPolicy({ ...base, expressions });
      expect(csp).toContain("default-src 'none'");
      expect(csp).not.toContain('connect-src');
      // A script without the nonce is refused in both modes.
      expect(csp).not.toContain("'unsafe-inline' 'nonce");
      expect(csp).toContain(`img-src ${base.cspSource} https: data: blob:`);
      expect(csp).toContain(`style-src ${base.cspSource} 'unsafe-inline'`);
    }
  });

  it('is what an untrusted workspace ends up with, end to end', () => {
    const expressions = resolveExpressionMode('full', false);
    expect(buildContentSecurityPolicy({ ...base, expressions })).not.toContain('unsafe-eval');
  });
});
