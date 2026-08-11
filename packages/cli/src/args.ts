/**
 * Argument parsing, done by hand.
 *
 * The package has no runtime dependencies, so `npx @mdxstudio/cli serve`
 * resolves and runs in one step instead of pulling a parser down first.
 */

export type Command = 'serve' | 'open' | 'help' | 'version';

export interface CliOptions {
  command: Command;
  /** Directory for `serve`; file path or `-` for `open`. */
  target: string;
  port: number | null;
  /** `null` means localhost. */
  host: string | null;
  openBrowser: boolean;
  watch: boolean;
  gitignore: boolean;
  expressions: 'full' | 'literals';
  theme: string;
  /** `--theme` was named on the command line, so it beats a remembered one. */
  themeExplicit: boolean;
}

export class UsageError extends Error {}

export const DEFAULT_PORT = 4321;

const DEFAULTS: CliOptions = {
  command: 'help',
  target: '.',
  port: null,
  host: null,
  openBrowser: false,
  watch: true,
  gitignore: true,
  expressions: 'full',
  theme: 'github-dark',
  themeExplicit: false,
};

function parsePort(value: string | undefined): number {
  if (value === undefined) throw new UsageError('--port needs a number, e.g. --port 4000');
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new UsageError(`--port must be a whole number between 0 and 65535, not "${value}"`);
  }
  return port;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { ...DEFAULTS };
  const positional: string[] = [];
  let sawCommand = false;
  let sawOpenFlag = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [flag, inlineValue] = argument.startsWith('--')
      ? [argument.split('=')[0], argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : undefined]
      : [argument, undefined];

    const take = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[index + 1];
      if (next === undefined || (next.startsWith('-') && next !== '-')) return undefined;
      index += 1;
      return next;
    };

    switch (flag) {
      case 'serve':
      case 'open':
        if (sawCommand) {
          positional.push(argument);
          break;
        }
        options.command = flag;
        sawCommand = true;
        break;

      case '-p':
      case '--port':
        options.port = parsePort(take());
        break;

      case '-H':
      case '--host':
        // Bare `--host` exposes on every interface. An explicit address uses
        // `--host=1.2.3.4`, never a separate token: `serve --host ./docs` would
        // otherwise swallow the directory.
        options.host = inlineValue && inlineValue !== '' ? inlineValue : '0.0.0.0';
        break;

      case '-o':
      case '--open':
        options.openBrowser = true;
        sawOpenFlag = true;
        break;

      case '--no-open':
        options.openBrowser = false;
        sawOpenFlag = true;
        break;

      case '--no-watch':
        options.watch = false;
        break;

      case '--watch':
        options.watch = true;
        break;

      case '--no-gitignore':
        options.gitignore = false;
        break;

      case '--expressions': {
        const value = take();
        if (value !== 'full' && value !== 'literals') {
          throw new UsageError(`--expressions must be "full" or "literals", not "${value ?? ''}"`);
        }
        options.expressions = value;
        break;
      }

      case '--theme': {
        const value = take();
        if (!value) throw new UsageError('--theme needs a theme id, e.g. --theme github-light');
        options.theme = value;
        options.themeExplicit = true;
        break;
      }

      case '-h':
      case '--help':
        return { ...options, command: 'help' };

      case '-v':
      case '--version':
        return { ...options, command: 'version' };

      default:
        if (argument.startsWith('-') && argument !== '-') {
          throw new UsageError(`unrecognised option: ${argument}`);
        }
        positional.push(argument);
    }
  }

  if (!sawCommand) {
    // `mdxstudio ./docs` is what everyone types first, and it can only mean one
    // thing. `mdxstudio` on its own prints help rather than guessing.
    if (positional.length === 0) return { ...options, command: 'help' };
    options.command = 'serve';
  }

  if (positional.length > 1) {
    throw new UsageError(`expected one path, got ${positional.length}: ${positional.join(' ')}`);
  }

  if (options.command === 'open') {
    if (positional.length === 0) {
      throw new UsageError('open needs a file, or `-` to read the document from stdin');
    }
    options.target = positional[0];
    // `open` means "show me this document now", so the browser opens unless
    // told not to. `serve` is a long-running server and stays quiet.
    if (!sawOpenFlag) options.openBrowser = true;
  } else if (options.command === 'serve') {
    options.target = positional[0] ?? '.';
  }

  return options;
}

export const HELP = `mdxstudio - read a folder of MDX and Markdown documents in your browser

Usage
  mdxstudio serve [dir]          Serve a folder, with a sidebar and live reload
  mdxstudio open <file>          Serve one document
  cat draft.mdx | mdxstudio open -
                                 Serve a document read from stdin

Options
  -p, --port <n>       Port to listen on (default ${DEFAULT_PORT}; the next free
                       port is used automatically unless --port was given)
  -H, --host[=addr]    Bind to every interface, so a phone on the same network
                       can read it. Use --host=1.2.3.4 to pick one address.
                       Without this the server is localhost-only.
  -o, --open           Open a browser (the default for \`open\`, off for \`serve\`)
      --no-open        Do not open a browser
      --no-watch       Do not watch for file changes or live-reload
      --no-gitignore   Include files that .gitignore excludes
      --expressions <full|literals>
                       How much of an MDX {expression} to evaluate. Default
                       full: your own repository's documents are trusted code.
                       Use literals when serving something you have not read.
      --theme <id>     github-dark (default), github-light, frosted-glass,
                       dracula, nord, editorial, cyberpunk, forest. Passing it
                       overrides the choice the browser remembered; without it,
                       the picker in the toolbar wins.
  -h, --help           This text
  -v, --version        Package version

Examples
  mdxstudio serve ./docs --port 4000 --open
  mdxstudio serve . --host              # read it from your phone
  mdxstudio open README.md
  claude -p "write the release notes" | mdxstudio open -

Notes
  .mdx and .md are both rendered. node_modules, dotted directories and anything
  .gitignore excludes are skipped.

  A served folder may contain an mdxstudio.config.js (or .mjs) whose default
  export registers extra components, aliases, code fences and remark/rehype
  plugins. Without one, nothing changes. See the package README for the shape.
`;
