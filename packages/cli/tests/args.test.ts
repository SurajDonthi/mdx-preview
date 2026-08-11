import { describe, expect, it } from 'vitest';

import { DEFAULT_PORT, parseArgs, UsageError } from '../src/args';

describe('parseArgs', () => {
  it('prints help when there is nothing to do', () => {
    expect(parseArgs([]).command).toBe('help');
    expect(parseArgs(['--help']).command).toBe('help');
    expect(parseArgs(['-v']).command).toBe('version');
  });

  it('serves the current directory by default', () => {
    const options = parseArgs(['serve']);
    expect(options).toMatchObject({ command: 'serve', target: '.', port: null, host: null });
  });

  it('takes the directory as a positional', () => {
    expect(parseArgs(['serve', './docs']).target).toBe('./docs');
  });

  it('treats a bare path as serve - it cannot mean anything else', () => {
    expect(parseArgs(['./docs'])).toMatchObject({ command: 'serve', target: './docs' });
  });

  it('reads the documented flag spelling', () => {
    const options = parseArgs(['serve', './docs', '--port', '4000', '--open', '--no-watch']);
    expect(options).toMatchObject({ port: 4000, openBrowser: true, watch: false });
  });

  it('accepts --flag=value as well as --flag value', () => {
    expect(parseArgs(['serve', '--port=4000']).port).toBe(4000);
    expect(parseArgs(['serve', '--expressions=literals']).expressions).toBe('literals');
  });

  it('exposes on every interface for a bare --host', () => {
    expect(parseArgs(['serve', '--host']).host).toBe('0.0.0.0');
    expect(parseArgs(['serve', '--host=192.168.1.9']).host).toBe('192.168.1.9');
  });

  it('does not let --host swallow the directory', () => {
    // The reason an explicit address needs `--host=addr`: with a separate
    // token, `serve --host ./docs` would bind to "./docs" and serve the cwd.
    expect(parseArgs(['serve', '--host', './docs'])).toMatchObject({
      host: '0.0.0.0',
      target: './docs',
    });
  });

  it('opens a browser for `open` but not for `serve`', () => {
    expect(parseArgs(['open', 'a.mdx']).openBrowser).toBe(true);
    expect(parseArgs(['open', 'a.mdx', '--no-open']).openBrowser).toBe(false);
    expect(parseArgs(['serve', './docs']).openBrowser).toBe(false);
  });

  it('accepts `-` as the stdin document', () => {
    expect(parseArgs(['open', '-'])).toMatchObject({ command: 'open', target: '-' });
  });

  it('records whether the theme was asked for, so it can beat a stored one', () => {
    expect(parseArgs(['serve']).themeExplicit).toBe(false);
    expect(parseArgs(['serve', '--theme', 'nord'])).toMatchObject({
      theme: 'nord',
      themeExplicit: true,
    });
  });

  it('rejects what it cannot act on', () => {
    expect(() => parseArgs(['serve', '--nope'])).toThrow(UsageError);
    expect(() => parseArgs(['serve', '--port', 'soon'])).toThrow(/whole number/);
    expect(() => parseArgs(['serve', '--port', '99999'])).toThrow(/65535/);
    expect(() => parseArgs(['serve', '--expressions', 'some'])).toThrow(/full/);
    expect(() => parseArgs(['open'])).toThrow(/stdin/);
    expect(() => parseArgs(['serve', 'a', 'b'])).toThrow(/one path/);
  });

  it('defaults the port to a constant the help text can name', () => {
    expect(DEFAULT_PORT).toBe(4321);
  });
});
