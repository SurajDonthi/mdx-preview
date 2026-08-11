import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip, gzipSync } from 'node:zlib';

import { API_PREFIX } from './protocol';
import type { BootData, ChangeEvent, DocEntry, DocResponse, TreeResponse } from './protocol';
import { isDocument } from './scan';
import { renderShell } from './shell';
import { safeJoin } from './source';
import type { DocSource } from './source';

const MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * The prebuilt browser bundle, which lives beside the compiled server inside
 * the published tarball. Resolved from `import.meta.url` rather than
 * `process.cwd()` so it is found wherever the CLI is invoked from.
 */
export function clientDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const candidate of [path.join(here, 'client'), path.join(here, '..', 'dist', 'client')]) {
    if (existsSync(path.join(candidate, 'main.js'))) return candidate;
  }
  throw new Error(
    'The browser bundle is missing. Run `npm run build -w @mdxstudio/cli` (or reinstall the package).'
  );
}

export interface DocServerOptions {
  expressions?: 'full' | 'literals';
  theme?: string;
  /** The theme was asked for by name, not defaulted. */
  themePinned?: boolean;
  version?: string;
  /** Live reload. The source decides whether it can actually watch. */
  watch?: boolean;
  /** Called once per change batch, after the tree has been re-read. */
  onChange?: (event: ChangeEvent) => void;
}

export interface DocServer {
  readonly server: Server;
  /** Live reload is on and the watcher started. */
  readonly watching: boolean;
  listen(port: number, host: string): Promise<number>;
  close(): Promise<void>;
}

/**
 * Compressible types. The bundle is 1.5 MB of JavaScript and CSS and gzip takes
 * roughly three quarters off it, which is the difference between a phone on the
 * far side of the house rendering a document quickly and not.
 */
const COMPRESSIBLE = /^(?:text\/|application\/(?:javascript|json)|image\/svg)/;

function acceptsGzip(request: IncomingMessage): boolean {
  return /\bgzip\b/.test(String(request.headers['accept-encoding'] ?? ''));
}

function send(
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  type = 'text/plain; charset=utf-8',
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, {
    'content-type': type,
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(body);
}

/** Below this a round of gzip costs more than the bytes it saves. */
const COMPRESS_THRESHOLD = 1024;

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  value: unknown
): void {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const type = 'application/json; charset=utf-8';

  if (body.length < COMPRESS_THRESHOLD || !acceptsGzip(request)) {
    send(response, status, body, type);
    return;
  }

  const gzipped = gzipSync(body);
  response.writeHead(status, {
    'content-type': type,
    'content-encoding': 'gzip',
    vary: 'accept-encoding',
    'content-length': gzipped.length,
    'cache-control': 'no-store',
  });
  response.end(gzipped);
}

export function createDocServer(source: DocSource, options: DocServerOptions = {}): DocServer {
  const clients = new Set<ServerResponse>();
  let docs: DocEntry[] = [];
  let known = new Set<string>();
  let watcher: ReturnType<DocSource['watch']> = null;

  /** What the sidebar draws, and nothing else: mtime changes on every save. */
  const signature = (list: DocEntry[]): string =>
    JSON.stringify(list.map((doc) => [doc.path, doc.title]));

  const refresh = async (): Promise<DocEntry[]> => {
    docs = await source.list();
    known = new Set(docs.map((doc) => doc.path));
    return docs;
  };

  const broadcast = (event: ChangeEvent): void => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.write(payload);
    options.onChange?.(event);
  };

  const handleChange = async (changed: string[]): Promise<void> => {
    const before = signature(docs);
    await refresh();

    // Not just the set of files: a document whose frontmatter title changed
    // has a stale label in the sidebar until the client re-reads the tree.
    const treeChanged = before !== signature(docs);

    // A directory event carries no document path of its own, so anything the
    // watcher reported that is not a document still means "re-read the tree".
    const touched = changed.filter((docPath) => isDocument(docPath) && known.has(docPath));

    if (!treeChanged && touched.length === 0) return;
    broadcast({ type: 'change', paths: touched, tree: treeChanged });
  };

  const serveClientAsset = async (
    request: IncomingMessage,
    response: ServerResponse,
    assetPath: string
  ): Promise<void> => {
    let directory: string;
    try {
      directory = clientDirectory();
    } catch (cause) {
      send(response, 500, cause instanceof Error ? cause.message : String(cause));
      return;
    }

    const absolute = safeJoin(directory, assetPath);
    if (!absolute) {
      send(response, 403, 'Forbidden');
      return;
    }

    try {
      const stats = await stat(absolute);
      if (!stats.isFile()) throw new Error('not a file');
      // The bundle is immutable for the life of the process, but a stale copy
      // across an upgrade would be a mystifying bug. Revalidate every time.
      streamFile(request, response, absolute, stats.size, 'no-cache');
    } catch {
      send(response, 404, 'Not found');
    }
  };

  const streamFile = (
    request: IncomingMessage,
    response: ServerResponse,
    absolute: string,
    size: number,
    cacheControl: string
  ): void => {
    const type = MIME[path.extname(absolute).toLowerCase()] ?? 'application/octet-stream';
    const compress = COMPRESSIBLE.test(type) && acceptsGzip(request);

    response.writeHead(200, {
      'content-type': type,
      'cache-control': cacheControl,
      ...(compress
        ? { 'content-encoding': 'gzip', vary: 'accept-encoding' }
        : { 'content-length': size }),
    });

    const stream = createReadStream(absolute);
    stream.on('error', () => response.end());
    if (compress) stream.pipe(createGzip()).pipe(response);
    else stream.pipe(response);
  };

  const serveFile = async (
    request: IncomingMessage,
    response: ServerResponse,
    absolute: string
  ): Promise<void> => {
    try {
      const stats = await stat(absolute);
      streamFile(request, response, absolute, stats.size, 'no-store');
    } catch {
      send(response, 404, 'Not found');
    }
  };

  const openEventStream = (response: ServerResponse): void => {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      // A proxy in front of a LAN server would otherwise sit on the stream.
      'x-accel-buffering': 'no',
    });
    response.write(': connected\n\n');
    clients.add(response);

    // Something between here and a phone on the LAN will drop an idle
    // connection; a comment every 25s is cheaper than reconnect storms.
    const ping = setInterval(() => response.write(': ping\n\n'), 25_000);
    response.on('close', () => {
      clearInterval(ping);
      clients.delete(response);
    });
  };

  const shellFor = (docPath: string, title: string): string => {
    const boot: BootData = {
      path: docPath,
      label: source.label,
      root: source.root,
      single: source.single,
      watch: watcher !== null,
      expressions: options.expressions ?? 'full',
      theme: options.theme ?? 'github-dark',
      themePinned: options.themePinned ?? false,
      version: options.version ?? '0.0.0',
    };
    return renderShell(boot, title);
  };

  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        send(response, 405, 'Method not allowed');
        return;
      }

      let url: URL;
      try {
        url = new URL(request.url ?? '/', 'http://localhost');
      } catch {
        send(response, 400, 'Bad request');
        return;
      }

      let pathname: string;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        send(response, 400, 'Bad request');
        return;
      }

      if (pathname.startsWith(`${API_PREFIX}/`)) {
        const route = pathname.slice(API_PREFIX.length + 1);

        if (route === 'events') {
          openEventStream(response);
          return;
        }

        if (route === 'api/tree') {
          const body: TreeResponse = {
            label: source.label,
            root: source.root,
            docs: await refresh(),
            single: source.single,
          };
          sendJson(request, response, 200, body);
          return;
        }

        if (route === 'api/doc') {
          const wanted = url.searchParams.get('path') ?? '';
          const document = await source.read(wanted);
          if (!document) {
            sendJson(request, response, 404, { error: `No such document: ${wanted}` });
            return;
          }
          const body: DocResponse = {
            path: wanted,
            content: document.content,
            mtimeMs: document.mtimeMs,
          };
          sendJson(request, response, 200, body);
          return;
        }

        if (route.startsWith('client/')) {
          await serveClientAsset(request, response, route.slice('client/'.length));
          return;
        }

        send(response, 404, 'Not found');
        return;
      }

      const requested = pathname.replace(/^\/+/, '');

      if (requested === '') {
        send(response, 200, shellFor('', source.label), 'text/html; charset=utf-8');
        return;
      }

      // A known document renders in the shell. Anything else that exists on
      // disk is an asset the document links to relatively - an image, usually -
      // and is served as itself.
      if (isDocument(requested)) {
        if (known.size === 0) await refresh();
        if (known.has(requested)) {
          const title = docs.find((doc) => doc.path === requested)?.title ?? requested;
          send(response, 200, shellFor(requested, title), 'text/html; charset=utf-8');
          return;
        }
      }

      const asset = await source.resolveAsset(requested);
      if (asset) {
        await serveFile(request, response, asset);
        return;
      }

      // 404, but still the application: a mistyped or stale URL lands on the
      // folder rather than on a dead end with no way back.
      send(response, 404, shellFor('', source.label), 'text/html; charset=utf-8');
    })().catch((cause: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      send(response, 500, cause instanceof Error ? cause.message : String(cause));
    });
  });

  return {
    server,
    get watching(): boolean {
      return watcher !== null;
    },

    async listen(port: number, host: string): Promise<number> {
      await refresh();

      await new Promise<void>((resolve, reject) => {
        const onError = (cause: Error): void => {
          server.off('listening', onListening);
          reject(cause);
        };
        const onListening = (): void => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });

      // Only after the bind succeeded. An open watcher keeps the event loop
      // alive, so starting one before a failed `listen` would leave a command
      // that printed its error and then hung. Guarded as well because `listen`
      // is retried on EADDRINUSE, and a second watcher would double every reload.
      if (options.watch !== false && watcher === null) {
        watcher = source.watch((changed) => {
          void handleChange(changed);
        });
      }

      const address = server.address();
      return typeof address === 'object' && address ? address.port : port;
    },

    async close(): Promise<void> {
      watcher?.close();
      watcher = null;
      for (const client of clients) client.end();
      clients.clear();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
