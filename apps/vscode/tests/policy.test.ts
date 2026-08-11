import { describe, expect, it } from 'vitest';

import {
  RESTRICTED_REASON,
  buildContentSecurityPolicy,
  configuredExpressionMode,
  isRestrictedByTrust,
  resolveConfigPolicy,
  resolveExpressionMode,
  restrictionMessage,
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
 *
 * `mdxstudio.config` is the same decision at a larger size: the file is a
 * module of the repository's own code, imported into the preview. There is no
 * `literals` to fall back to, so trust does not lower it, it forbids it.
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

describe('resolveConfigPolicy', () => {
  /*
   * The matrix. Rows are what `mdxstudio.config` says, columns are trust, and
   * the only cells where `enabled` is true are the trusted ones.
   */
  const settings = ['', 'mdxstudio.config.js', '.vscode/preview.config.js', '/abs/x.js'];

  it('loads a config only in a trusted workspace', () => {
    for (const setting of settings) {
      expect(resolveConfigPolicy(setting, true).enabled).toBe(true);
      expect(resolveConfigPolicy(setting, false).enabled).toBe(false);
    }
  });

  it('never loads one in an untrusted workspace, whatever the setting says', () => {
    // The values a hostile `.vscode/settings.json` might try. None of them is a
    // way back in: `off` is the only one that changes anything, and it only
    // turns loading further off.
    for (const value of ['', 'x.js', 'ON', true, 1, {}, ['x.js'], null, undefined]) {
      expect(resolveConfigPolicy(value, false).enabled).toBe(false);
    }
  });

  it('reports trust as the reason, so the preview can say so', () => {
    expect(resolveConfigPolicy('', false).restricted).toBe(true);
    expect(resolveConfigPolicy('x.js', false).restricted).toBe(true);
    // Nothing is being withheld from someone who asked for nothing.
    expect(resolveConfigPolicy('off', false).restricted).toBe(false);
    expect(resolveConfigPolicy('', true).restricted).toBe(false);
  });

  it('honours off in a trusted workspace, and looks for nothing', () => {
    for (const value of ['off', 'OFF', ' Off ']) {
      const policy = resolveConfigPolicy(value, true);
      expect(policy.enabled).toBe(false);
      expect(policy.off).toBe(true);
      expect(policy.path).toBeNull();
    }
  });

  it('searches the folder when the setting names no file', () => {
    expect(resolveConfigPolicy('', true).path).toBeNull();
    expect(resolveConfigPolicy('   ', true).path).toBeNull();
    expect(resolveConfigPolicy(42, true).path).toBeNull();
  });

  it('keeps the named file even untrusted, so the banner names the right one', () => {
    expect(resolveConfigPolicy(' cfg/mine.js ', false).path).toBe('cfg/mine.js');
  });
});

describe('restrictionMessage', () => {
  it('says nothing when nothing is held back', () => {
    expect(restrictionMessage({ expressions: false, configFile: null })).toBeNull();
  });

  it('is the expressions notice when only expressions are held back', () => {
    expect(restrictionMessage({ expressions: true, configFile: null })).toBe(RESTRICTED_REASON);
  });

  it('names the config file when that is what was skipped', () => {
    const message = restrictionMessage({ expressions: false, configFile: 'mdxstudio.config.js' });
    expect(message).toContain('not trusted');
    expect(message).toContain('mdxstudio.config.js');
  });

  it('says both when both are held back', () => {
    // A reader told about only one of them spends the afternoon on the other.
    const message = restrictionMessage({ expressions: true, configFile: 'preview.config.js' });
    expect(message).toContain('read literally');
    expect(message).toContain('without eval');
    expect(message).toContain('preview.config.js');
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

  /** One directive out of the policy, so an assertion cannot match another. */
  const directive = (csp: string, name: string): string =>
    csp.split('; ').find((part) => part.startsWith(`${name} `)) ?? '';

  it('names the webview origin in script-src only for a page that loads a config', () => {
    const without = buildContentSecurityPolicy({ ...base, expressions: 'literals' });
    const with_ = buildContentSecurityPolicy({
      ...base,
      expressions: 'literals',
      loadsConfig: true,
    });

    expect(directive(without, 'script-src')).toBe(`script-src 'nonce-abc123'`);
    expect(directive(with_, 'script-src')).toBe(
      `script-src 'nonce-abc123' ${base.cspSource}`
    );
    // And nothing else moves: the config grant is one source in one directive.
    expect(with_.replace(`script-src 'nonce-abc123' ${base.cspSource}`, '')).toBe(
      without.replace(`script-src 'nonce-abc123'`, '')
    );
  });

  it('never grants a general-purpose script channel for the config', () => {
    const csp = buildContentSecurityPolicy({
      ...base,
      expressions: 'literals',
      loadsConfig: true,
    });
    const scriptSrc = directive(csp, 'script-src');

    // `blob:` and `data:` in script-src are `unsafe-eval` by another name, and
    // `'unsafe-inline'` would let the document itself run. The origin is the
    // whole grant: files the webview is already allowed to read.
    expect(scriptSrc).not.toContain('blob:');
    expect(scriptSrc).not.toContain('data:');
    expect(scriptSrc).not.toContain('https:');
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(csp).not.toContain('script-src-elem');
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain('connect-src');
  });

  it('is what an untrusted workspace ends up with, end to end', () => {
    const expressions = resolveExpressionMode('full', false);
    const config = resolveConfigPolicy('mdxstudio.config.js', false);
    const csp = buildContentSecurityPolicy({
      ...base,
      expressions,
      // What `preview.ts` passes: the policy's own answer, never the setting's.
      loadsConfig: config.enabled,
    });

    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toBe(buildContentSecurityPolicy({ ...base, expressions: 'literals' }));
  });
});
