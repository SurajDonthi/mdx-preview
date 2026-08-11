import { describe, expect, it } from 'vitest';

import { BEGIN_MARKER, END_MARKER, hasBlock, stripBlock, upsertBlock } from '../src/block';

const BODY = ['## Documentation format', '', 'Write docs as `.mdx`.'].join('\n');
const BLOCK = `${BEGIN_MARKER}\n${BODY}\n${END_MARKER}`;

describe('upsertBlock', () => {
  it('creates the block in an empty file', () => {
    const result = upsertBlock('', BODY);

    expect(result.action).toBe('created');
    expect(result.text).toBe(`${BLOCK}\n`);
    expect(hasBlock(result.text)).toBe(true);
  });

  it('appends after unrelated content without rewriting it', () => {
    const existing = '# My rules\n\nAlways use tabs.\nNever use semicolons.\n';

    const result = upsertBlock(existing, BODY);

    expect(result.action).toBe('created');
    expect(result.text).toBe(`${existing}\n${BLOCK}\n`);
    expect(result.text.startsWith(existing)).toBe(true);
  });

  it('preserves blank lines inside the author\'s own content', () => {
    const existing = '# Rules\n\n\nA rule.\n\n\nAnother rule.\n';

    const result = upsertBlock(existing, BODY);

    expect(result.text).toContain('# Rules\n\n\nA rule.\n\n\nAnother rule.');
  });

  it('is idempotent: a second add changes nothing', () => {
    const once = upsertBlock('# Rules\n\nA rule.\n', BODY);
    const twice = upsertBlock(once.text, BODY);

    expect(twice.action).toBe('unchanged');
    expect(twice.text).toBe(once.text);
    expect(twice.text.split(BEGIN_MARKER)).toHaveLength(2);
    expect(twice.text.split(END_MARKER)).toHaveLength(2);
  });

  it('replaces a stale block in place rather than appending a second one', () => {
    const stale = upsertBlock('# Rules\n\nA rule.\n', 'old body').text;

    const result = upsertBlock(stale, BODY);

    expect(result.action).toBe('updated');
    expect(result.text).not.toContain('old body');
    expect(result.text).toContain(BODY);
    expect(result.text.split(BEGIN_MARKER)).toHaveLength(2);
  });

  it('keeps content that follows the block when replacing it', () => {
    const source = `# Top\n\n${BEGIN_MARKER}\nold\n${END_MARKER}\n\n# Bottom\n\nStill here.\n`;

    const result = upsertBlock(source, BODY);

    expect(result.text).toBe(`# Top\n\n${BLOCK}\n\n# Bottom\n\nStill here.\n`);
  });

  it('does not treat a marker mentioned inside a sentence as a marker', () => {
    const source = `The block is delimited by ${BEGIN_MARKER} and ${END_MARKER} comments.\n`;

    const result = upsertBlock(source, BODY);

    expect(result.action).toBe('created');
    expect(result.repairedPartialMarkers).toBe(false);
    expect(result.text.startsWith(source)).toBe(true);
  });
});

describe('a malformed or half-present block', () => {
  it('drops a lone begin marker and appends a fresh block, keeping the orphaned prose', () => {
    const source = `# Rules\n\n${BEGIN_MARKER}\nan orphaned line the user may have written\n`;

    const result = upsertBlock(source, BODY);

    expect(result.repairedPartialMarkers).toBe(true);
    expect(result.action).toBe('created');
    expect(result.text).toContain('an orphaned line the user may have written');
    expect(result.text.split(BEGIN_MARKER)).toHaveLength(2);
    expect(result.text.split(END_MARKER)).toHaveLength(2);
  });

  it('drops a lone end marker', () => {
    const source = `# Rules\n\n${END_MARKER}\n\nMore rules.\n`;

    const result = upsertBlock(source, BODY);

    expect(result.repairedPartialMarkers).toBe(true);
    expect(result.text).toContain('More rules.');
    expect(result.text.split(END_MARKER)).toHaveLength(2);
  });

  it('collapses a duplicated block down to one', () => {
    const source = `${BLOCK}\n\n# Rules\n\n${BLOCK}\n`;

    const result = upsertBlock(source, BODY);

    expect(result.repairedPartialMarkers).toBe(true);
    expect(result.text.split(BEGIN_MARKER)).toHaveLength(2);
    expect(result.text.split(END_MARKER)).toHaveLength(2);
    expect(result.text).toContain('# Rules');
  });

  it('ignores markers written in the wrong order', () => {
    const source = `${END_MARKER}\n\nsome text\n\n${BEGIN_MARKER}\n`;

    const result = upsertBlock(source, BODY);

    expect(result.repairedPartialMarkers).toBe(true);
    expect(result.text).toContain('some text');
    expect(hasBlock(result.text)).toBe(true);
  });
});

describe('stripBlock', () => {
  it('restores the file byte-for-byte', () => {
    for (const existing of [
      '# My rules\n\nAlways use tabs.\n',
      '# Rules\n\n\nSpaced out.\n\n\nContent.\n',
      '- a\n- b\n',
      '',
    ]) {
      const added = upsertBlock(existing, BODY);
      expect(stripBlock(added.text).text).toBe(existing);
    }
  });

  it('reports removal and leaves nothing behind', () => {
    const added = upsertBlock('# Rules\n\nA rule.\n', BODY);

    const result = stripBlock(added.text);

    expect(result.action).toBe('removed');
    expect(result.text).not.toContain(BEGIN_MARKER);
    expect(result.text).not.toContain(END_MARKER);
    expect(result.text).not.toContain('Documentation format');
  });

  it('keeps content on both sides of a block in the middle', () => {
    const source = `# Top\n\n${BLOCK}\n\n# Bottom\n`;

    expect(stripBlock(source).text).toBe('# Top\n\n# Bottom\n');
  });

  it('leaves a file that has no block completely alone', () => {
    const source = '# Rules\n\nNothing managed here.\n';

    const result = stripBlock(source);

    expect(result.action).toBe('absent');
    expect(result.text).toBe(source);
  });

  it('removes stray markers from a half-present block without eating the prose', () => {
    const source = `# Rules\n\n${BEGIN_MARKER}\nprose the user might own\n`;

    const result = stripBlock(source);

    expect(result.action).toBe('absent');
    expect(result.repairedPartialMarkers).toBe(true);
    expect(result.text).not.toContain(BEGIN_MARKER);
    expect(result.text).toContain('prose the user might own');
  });

  it('empties a file that contained only the block', () => {
    const added = upsertBlock('', BODY);

    expect(stripBlock(added.text).text).toBe('');
  });
});
