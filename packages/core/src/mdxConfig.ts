/**
 * `mdxstudio.config.js` - the file a project writes to add its own components
 * to whichever host is rendering its documents.
 *
 * The contract lives here rather than in one of the hosts because there is only
 * one contract: the CLI serves a folder and the VS Code extension previews a
 * workspace, and a config file that worked in one and not the other would be
 * worse than having no config file at all.
 *
 * The config runs wherever the *renderer* runs, which for both hosts is a
 * browser page: a component it contributes has to be a real React component in
 * that page, and a remark plugin it contributes has to be in the pipeline the
 * page parses with. Neither host reads the file in its own process and neither
 * can - a component is not data.
 *
 * Because it runs in a browser it cannot resolve bare specifiers - there is no
 * node_modules in a browser - so anything it needs is handed to it instead:
 * `export default (context) => ({ ... })` receives React and the components
 * already registered. A plugin from npm is imported from a URL, or written
 * inline; a remark plugin is a plain function and usually needs nothing at all.
 *
 * Nothing here throws. A config that is missing, malformed or broken produces a
 * message naming the file, and the host carries on with its built-in registry:
 * a mistake in an optional file must not cost the reader the documents.
 */

import { defineMdxPlugin } from './registry';
import type { MdxComponentMap, MdxRegistrySource } from './registry';

/**
 * What the file may be called, in the order they are tried.
 *
 * `.js` first because a folder that has one is almost never an ESM package as
 * well; `.mjs` is there for the folder that is, where a `.js` file would be
 * read as CommonJS by everything else in the toolchain.
 */
export const MDX_CONFIG_FILENAMES = [
  'mdxstudio.config.js',
  'mdxstudio.config.mjs',
] as const;

/** What a config file's function form is called with. */
export interface MdxConfigContext {
  /** The one React instance in the page. */
  React: unknown;
  /** `React.createElement`, for components written without JSX. */
  createElement: unknown;
  /** Everything already registered, so a config can wrap or replace one. */
  components: MdxComponentMap;
}

export interface LoadedMdxConfig<T> {
  registry: T;
  /** A message naming the file, or `null` when there was nothing to report. */
  error: string | null;
}

/** The object a config file's default export is, or resolves to. */
export interface MdxConfigShape {
  components?: MdxComponentMap;
  aliases?: Record<string, string>;
  codeFences?: Record<string, string>;
  remarkPlugins?: unknown[];
  rehypePlugins?: unknown[];
}

function reasonFor(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Turns the default export into a registry source, or explains why it cannot. */
export function configSource(
  file: string,
  exported: unknown
): { source: MdxRegistrySource | null; error: string | null } {
  if (exported === null || exported === undefined) {
    return {
      source: null,
      error: `${file} has no default export. Write \`export default { components: { ... } }\`.`,
    };
  }

  if (typeof exported !== 'object') {
    return {
      source: null,
      error: `${file} exported ${typeof exported}; expected an object, or a function returning one.`,
    };
  }

  const config = exported as MdxConfigShape;

  return {
    source: defineMdxPlugin({
      // The file name, so a clash or an unresolved alias is reported against
      // the thing the reader can actually edit.
      name: file,
      components: config.components,
      aliases: config.aliases,
      codeFences: config.codeFences,
      remarkPlugins: config.remarkPlugins as never,
      rehypePlugins: config.rehypePlugins as never,
    }),
    error: null,
  };
}

export interface LoadMdxConfigOptions<T> {
  /** How the file is named in messages, e.g. `mdxstudio.config.js`. */
  file: string;
  /**
   * What to import, when that is not `/${file}`.
   *
   * The CLI serves the folder, so the file's own name is a URL. A webview
   * cannot load anything off disk directly, so the VS Code extension passes the
   * `asWebviewUri()` form of the same file instead.
   */
  specifier?: string;
  context: MdxConfigContext;
  /** Builds the registry. Called with `[]` when the config cannot be used. */
  build: (sources: MdxRegistrySource[]) => T;
  /** Imports the module. Injected so this is testable off a network. */
  load?: (specifier: string) => Promise<unknown>;
}

const importModule = (specifier: string): Promise<unknown> =>
  import(/* @vite-ignore */ specifier) as Promise<unknown>;

export async function loadMdxConfig<T>(
  options: LoadMdxConfigOptions<T>
): Promise<LoadedMdxConfig<T>> {
  const { file, context, build } = options;
  const specifier = options.specifier ?? `/${file}`;
  const load = options.load ?? importModule;

  const failed = (error: string): LoadedMdxConfig<T> => ({ registry: build([]), error });

  let exported: unknown;
  try {
    const module = (await load(specifier)) as { default?: unknown } | null;
    exported = module?.default;
    // A factory gets the context, and may be async - a config that fetches
    // something before deciding what to register is a reasonable thing to write.
    if (typeof exported === 'function') {
      exported = await (exported as (context: MdxConfigContext) => unknown)(context);
    }
  } catch (cause) {
    return failed(`${file} could not be loaded: ${reasonFor(cause)}`);
  }

  const { source, error } = configSource(file, exported);
  if (!source) return failed(error ?? `${file} could not be used.`);

  try {
    return { registry: build([source]), error: null };
  } catch (cause) {
    // `createMdxRegistry` throws for an alias or a fence naming nothing, and it
    // names the plugin - which is this file.
    return failed(`${file} could not be applied: ${reasonFor(cause)}`);
  }
}
