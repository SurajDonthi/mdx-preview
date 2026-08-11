import { describe, expect, it } from 'vitest';

import { IgnoreStack, parseIgnoreFile } from '../src/gitignore';

const stack = (text: string, base = ''): IgnoreStack => IgnoreStack.empty().with(base, text);

describe('parseIgnoreFile', () => {
  it('skips comments and blank lines', () => {
    expect(parseIgnoreFile('# a comment\n\n   \nbuild\n')).toHaveLength(1);
  });

  it('records negation and directory-only patterns', () => {
    const [ignore, allow] = parseIgnoreFile('build/\n!build/keep\n');
    expect(ignore).toMatchObject({ dirOnly: true, negated: false });
    expect(allow).toMatchObject({ dirOnly: false, negated: true });
  });
});

describe('IgnoreStack', () => {
  it('matches a bare name at any depth', () => {
    const rules = stack('drafts\n');
    expect(rules.ignores('drafts', true)).toBe(true);
    expect(rules.ignores('docs/drafts', true)).toBe(true);
    expect(rules.ignores('docs/drafts/a.mdx', false)).toBe(true);
    expect(rules.ignores('docs/published', true)).toBe(false);
  });

  it('anchors a pattern that contains a slash', () => {
    const rules = stack('docs/private\n');
    expect(rules.ignores('docs/private', true)).toBe(true);
    expect(rules.ignores('deep/docs/private', true)).toBe(false);
  });

  it('anchors a leading slash to the file own directory', () => {
    const rules = stack('/build\n');
    expect(rules.ignores('build', true)).toBe(true);
    expect(rules.ignores('packages/build', true)).toBe(false);
  });

  it('honours a directory-only pattern', () => {
    const rules = stack('dist/\n');
    expect(rules.ignores('dist', true)).toBe(true);
    expect(rules.ignores('dist', false)).toBe(false);
  });

  it('lets a later rule win, which is how negation works', () => {
    const rules = stack('*.draft.md\n!keep/important.draft.md\n');
    expect(rules.ignores('a.draft.md', false)).toBe(true);
    expect(rules.ignores('keep/important.draft.md', false)).toBe(false);
  });

  it('expands * within a segment and ** across segments', () => {
    const single = stack('docs/*.tmp\n');
    expect(single.ignores('docs/a.tmp', false)).toBe(true);
    expect(single.ignores('docs/deep/a.tmp', false)).toBe(false);

    const deep = stack('docs/**/generated\n');
    expect(deep.ignores('docs/generated', true)).toBe(true);
    expect(deep.ignores('docs/a/b/generated', true)).toBe(true);
  });

  it('treats a nested .gitignore as relative to its own directory', () => {
    const rules = IgnoreStack.empty().with('', 'top\n').with('docs', 'local\n');
    expect(rules.ignores('top', true)).toBe(true);
    expect(rules.ignores('docs/local', true)).toBe(true);
    // `local` belongs to docs/.gitignore and says nothing about the root.
    expect(rules.ignores('local', true)).toBe(false);
  });

  it('does not treat a pattern as a regular expression', () => {
    const rules = stack('a.b\n');
    expect(rules.ignores('a.b', false)).toBe(true);
    expect(rules.ignores('axb', false)).toBe(false);
  });
});
