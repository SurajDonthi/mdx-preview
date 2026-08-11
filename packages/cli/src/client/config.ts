import { defineMdxPlugin } from '@mdxstudio/core';
import type { MdxComponentMap, MdxRegistrySource } from '@mdxstudio/core';

/**
 * Loading `mdxstudio.config.js` from the folder being served.
 *
 * The config runs in the browser, because that is where the renderer is: a
 * component it contributes has to be a real React component in the page, and a
 * remark plugin it contributes has to be in the pipeline the page parses with.
 * The server only finds the file and serves it; this module imports it over
 * HTTP and turns its default export into registry sources.
 *
 * Because it runs in the browser it cannot resolve bare specifiers - there is
 * no node_modules in a browser - so anything it needs is handed to it instead:
 * `export default (context) => ({ ... })` receives React and the components
 * already registered. A plugin from npm is imported from a URL, or written
 * inline; a remark plugin is a plain function and usually needs nothing at all.
 *
 * Nothing here throws. A config that is missing, malformed or broken produces a
 * message naming the file, and the CLI carries on with its built-in registry:
 * a mistake in an optional file must not cost the reader the documents.
 */

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

interface ConfigShape {
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

  const config = exported as ConfigShape;

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
  /** File name relative to the served root, e.g. `mdxstudio.config.js`. */
  file: string;
  context: MdxConfigContext;
  /** Builds the registry. Called with `[]` when the config cannot be used. */
  build: (sources: MdxRegistrySource[]) => T;
  /** Imports the module. Injected so this is testable off a network. */
  load?: (specifier: string) => Promise<unknown>;
}

const importModule = (specifier: string): Promise<unknown> =>
  import(/* @vite-ignore */ specifier) as Promise<unknown>;

export async function loadMdxConfig<T>(options: LoadMdxConfigOptions<T>): Promise<LoadedMdxConfig<T>> {
  const { file, context, build } = options;
  const load = options.load ?? importModule;

  const failed = (error: string): LoadedMdxConfig<T> => ({ registry: build([]), error });

  let exported: unknown;
  try {
    const module = (await load(`/${file}`)) as { default?: unknown } | null;
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
