#!/usr/bin/env node
/**
 * `mdxstudio` - serve a folder of MDX documents to a browser.
 *
 * The reason this exists: reading a repository's documentation should not mean
 * uploading one file at a time into a web application.
 */
import { readFileSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PORT, HELP, parseArgs, UsageError } from './args';
import type { CliOptions } from './args';
import { findConfigFile } from './config';
import { createDocServer } from './server';
import { createDirectorySource, createMemorySource } from './source';
import type { DocSource } from './source';

/** How many ports to try past the default before giving up. */
const PORT_SEARCH_RANGE = 20;

function version(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [
    path.resolve(here, '../package.json'),
    path.resolve(here, 'package.json'),
  ]) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')).version as string;
    } catch {
      // try the next layout
    }
  }
  return 'unknown';
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      text += chunk;
    });
    process.stdin.on('end', () => resolve(text));
    process.stdin.on('error', reject);
  });
}

function lanAddresses(): string[] {
  const found: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) found.push(entry.address);
    }
  }
  return found;
}

function openBrowser(url: string): void {
  void import('node:child_process').then(({ spawn }) => {
    const [command, args] =
      process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]];
    try {
      spawn(command, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
    } catch {
      // A machine with no browser is not an error worth failing the run for.
    }
  });
}

/**
 * Binds, walking forward from `port` when the port was not asked for by name.
 * An explicit `--port` that is taken is a hard error: silently listening
 * somewhere else is worse than saying so.
 */
async function listen(
  server: ReturnType<typeof createDocServer>,
  options: CliOptions,
  host: string
): Promise<number> {
  const first = options.port ?? DEFAULT_PORT;
  const attempts = options.port === null ? PORT_SEARCH_RANGE : 1;

  for (let offset = 0; offset < attempts; offset += 1) {
    try {
      return await server.listen(first + offset, host);
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (code === 'EADDRINUSE' && offset < attempts - 1) continue;

      if (code === 'EADDRINUSE') {
        throw new Error(
          options.port === null
            ? `Ports ${first}-${first + attempts - 1} are all in use. Pass --port to choose one.`
            : `Port ${first} is already in use. Pass a different --port, or stop what is on it.`
        );
      }
      if (code === 'EACCES') {
        throw new Error(`Not allowed to bind port ${first + offset}. Ports below 1024 need privileges.`);
      }
      if (code === 'EADDRNOTAVAIL') {
        throw new Error(`No interface has the address ${host}.`);
      }
      throw cause;
    }
  }

  throw new Error('Could not bind a port.');
}

async function buildSource(options: CliOptions): Promise<DocSource> {
  if (options.command === 'open') {
    if (options.target === '-') {
      if (process.stdin.isTTY) {
        throw new UsageError(
          'Nothing is piped into stdin. Try `cat draft.mdx | mdxstudio open -`, or name a file.'
        );
      }
      const content = await readStdin();
      if (content.trim() === '') throw new UsageError('stdin was empty - there is nothing to render.');
      return createMemorySource('stdin.mdx', content);
    }

    const absolute = path.resolve(options.target);
    let stats;
    try {
      stats = await stat(absolute);
    } catch {
      throw new UsageError(`No such file: ${absolute}`);
    }
    if (stats.isDirectory()) {
      throw new UsageError(`${absolute} is a directory. Use \`mdxstudio serve\` for a folder.`);
    }

    // One file, served from its own folder so its relative images resolve and
    // so its neighbours are one click away.
    return createDirectorySource(path.dirname(absolute), {
      respectGitignore: options.gitignore,
      watch: options.watch,
    });
  }

  const absolute = path.resolve(options.target);
  let stats;
  try {
    stats = await stat(absolute);
  } catch {
    throw new UsageError(`No such directory: ${absolute}`);
  }
  if (!stats.isDirectory()) {
    throw new UsageError(`${absolute} is a file. Use \`mdxstudio open\` for a single document.`);
  }

  return createDirectorySource(absolute, {
    respectGitignore: options.gitignore,
    watch: options.watch,
  });
}

/** The document `open <file>` should land on, relative to the served folder. */
function initialPath(options: CliOptions): string {
  if (options.command !== 'open') return '';
  if (options.target === '-') return 'stdin.mdx';
  return path.basename(path.resolve(options.target));
}

async function main(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (cause) {
    console.error(cause instanceof UsageError ? cause.message : String(cause));
    console.error('\nRun `mdxstudio --help` for usage.');
    return 1;
  }

  if (options.command === 'help') {
    console.log(HELP);
    return 0;
  }
  if (options.command === 'version') {
    console.log(version());
    return 0;
  }

  let source: DocSource;
  try {
    source = await buildSource(options);
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }

  // Only for a real folder: the client fetches the file over HTTP, and a
  // document read from stdin has no folder to fetch it from.
  const configFile = source.single ? null : await findConfigFile(source.root);

  const server = createDocServer(source, {
    expressions: options.expressions,
    theme: options.theme,
    themePinned: options.themeExplicit,
    version: version(),
    configFile,
    watch: options.watch,
  });

  const host = options.host ?? '127.0.0.1';

  let port: number;
  try {
    port = await listen(server, options, host);
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    // The watcher is started before the bind, and an open watcher keeps the
    // event loop alive: without this the failed command never exits.
    await server.close();
    return 1;
  }

  const docs = await source.list();
  const start = initialPath(options);
  const localUrl = `http://localhost:${port}/${start ? encodeURI(start) : ''}`;

  console.log('');
  console.log(`  MDX Studio  v${version()}`);
  console.log('');
  console.log(`  Local     ${localUrl}`);
  if (options.host !== null) {
    for (const address of lanAddresses()) {
      console.log(`  Network   http://${address}:${port}/${start ? encodeURI(start) : ''}`);
    }
  }
  console.log(
    `  ${source.single ? 'Reading' : 'Folder'}    ${source.single ? 'stdin' : source.root}`
  );
  console.log(
    `  Documents ${docs.length}${docs.length === 0 ? '  (nothing with a .mdx or .md extension here)' : ''}`
  );
  console.log(
    `  Live      ${server.watching ? 'on - saved changes reload the page' : 'off'}`
  );
  if (configFile) console.log(`  Config    ${configFile}`);
  if (options.host === null) {
    console.log('  Bound to localhost. Pass --host to read it from another device.');
  }
  console.log('');
  console.log('  Ctrl+C to stop.');
  console.log('');

  if (options.openBrowser) openBrowser(localUrl);

  let closing = false;
  const shutdown = (): void => {
    if (closing) return;
    closing = true;
    void server.close().then(() => {
      process.exit(0);
    });
    // A client holding an event stream open must not keep the process alive.
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Resolve only when the server stops.
  await new Promise<void>((resolve) => server.server.on('close', resolve));
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 2;
  }
);
