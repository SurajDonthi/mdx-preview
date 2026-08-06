import React, { useState, useEffect, useMemo, useRef, Component, ErrorInfo } from 'react';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';

import {
  MdxRenderContext,
  parseFrontmatter,
  slugify,
  parseMdxDocument,
  formatMdxParseError,
  countLines,
  evaluateEstreeLiteral,
  createFullEstreeEvaluator,
} from '@mdxkit/core';
import type {
  ThemeConfig,
  MdxRegistry,
  MdxRenderMode,
  MdxExpressionMode,
  MdxComponentMap,
  MdxDiagnostic,
  MdxExpressionEvaluator,
  MdxExpressionResult,
  MdxExpressionSlot,
  MdxParseError,
} from '@mdxkit/core';
import { FrontmatterHeader } from './FrontmatterHeader';
import { baseMdxRegistry } from './plugin';
import { InlineToken } from './InlineToken';
import * as Icons from 'lucide-react';

/**
 * Catches errors thrown by a component while the document renders.
 *
 * `resetKey` clears the error when the document changes, so one bad keystroke
 * does not leave the preview stuck on the banner after it is fixed.
 */
class MdxErrorBoundary extends Component<
  { children: React.ReactNode; resetKey: unknown; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null; resetKey: unknown }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(
    props: { resetKey: unknown },
    state: { resetKey: unknown }
  ) {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, error: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.warn('MDX Render Error:', error, errorInfo);
    if (this.props.onError) this.props.onError(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 my-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-mono">
          <div className="font-semibold flex items-center gap-2 text-sm mb-1">
            <Icons.AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>MDX Component Error</span>
          </div>
          <div>{this.state.error?.message || 'A component threw while rendering.'}</div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Custom Code Block component with Syntax Highlighting and Copy Button
function CodeBlock({
  language,
  value,
  registry = baseMdxRegistry,
}: {
  language?: string;
  value: string;
  themeConfig?: ThemeConfig;
  registry?: MdxRegistry;
}) {
  const [copied, setCopied] = useState(false);

  const cleanLang = (language || 'text').toLowerCase();

  const highlightedCode = useMemo(() => {
    try {
      const grammar = Prism.languages[cleanLang] || Prism.languages.text || Prism.languages.javascript;
      return Prism.highlight(value, grammar, cleanLang);
    } catch {
      return value;
    }
  }, [value, cleanLang]);

  // A plugin may claim a fence language (```mermaid) and render it itself.
  const FenceComponent = registry.codeFences[cleanLang];
  if (FenceComponent) {
    return <FenceComponent language={cleanLang}>{value}</FenceComponent>;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-5 rounded-2xl overflow-hidden border border-slate-700/50 bg-slate-950 text-slate-100 shadow-lg group">
      {/* Code Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400 font-mono">
        <span className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
          <span className="ml-2 font-semibold text-slate-300 uppercase tracking-wider text-[10px]">
            {cleanLang}
          </span>
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <Icons.Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Icons.Copy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Highlighting Content */}
      <div className="p-4 overflow-x-auto custom-scrollbar font-mono text-xs leading-relaxed">
        <pre className="m-0 p-0 bg-transparent">
          <code
            className={`language-${cleanLang}`}
            dangerouslySetInnerHTML={{ __html: highlightedCode }}
          />
        </pre>
      </div>
    </div>
  );
}

// Context to track if code element is enclosed in a <pre> block (fenced code block)
const PreContext = React.createContext(false);

function PreElement({ children }: any) {
  return (
    <PreContext.Provider value={true}>
      {children}
    </PreContext.Provider>
  );
}

function CustomCodeElement({
  node,
  className,
  children,
  themeConfig,
  registry = baseMdxRegistry,
  ...props
}: any) {
  const isInsidePre = React.useContext(PreContext);
  const match = /language-(\w+)/.exec(className || '');
  const value = String(children).replace(/\n$/, '');
  const cleanLang = (match ? match[1] : '').toLowerCase();

  // Code block condition: inside <pre>, explicit language tag, or multiline code
  const isBlock = isInsidePre || Boolean(match) || value.includes('\n');

  if (isBlock) {
    const FenceComponent = (registry as MdxRegistry).codeFences[cleanLang];
    if (FenceComponent) {
      return <FenceComponent language={cleanLang}>{value}</FenceComponent>;
    }
    return (
      <CodeBlock
        language={cleanLang}
        value={value}
        themeConfig={themeConfig}
        registry={registry}
      />
    );
  }

  // Inline code rendering
  return (
    <InlineToken
      as="code"
      kind="code"
      tone={themeConfig.category}
      appearanceClassName={`${themeConfig.codeBgClass} ${themeConfig.codeTextClass}`}
      {...props}
    >
      {children}
    </InlineToken>
  );
}

/**
 * Stand-in for a JSX tag whose name is not in the registry.
 *
 * The document keeps rendering - the tag's own children are still shown - and
 * the author gets the exact name that could not be resolved.
 */
const unknownComponentCache = new Map<string, React.ComponentType<any>>();

function getUnknownComponent(name: string): React.ComponentType<any> {
  const cached = unknownComponentCache.get(name);
  if (cached) return cached;

  const UnknownMdxComponent = ({ children }: { children?: React.ReactNode }) => (
    <>
      <span
        data-mdx-unknown-component={name}
        className="inline-flex items-center gap-1.5 align-middle px-2 py-0.5 mx-0.5 my-1 rounded-md border border-dashed border-rose-400/60 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs font-mono"
      >
        <Icons.HelpCircle className="w-3.5 h-3.5 shrink-0" />
        <span>
          Unknown component <strong className="font-semibold">{`<${name}>`}</strong>
        </span>
      </span>
      {children}
    </>
  );
  UnknownMdxComponent.displayName = `UnknownMdxComponent(${name})`;

  unknownComponentCache.set(name, UnknownMdxComponent);
  return UnknownMdxComponent;
}

// Tags that are legal inside a <p>. Used to decide whether a markdown paragraph
// has to become a <div> to keep the HTML valid.
const INLINE_TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i',
  'img', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup',
  'time', 'u', 'var', 'wbr', 'svg',
]);

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

// HTML tags that cannot legally sit inside a <p>. MDX classifies a tag written
// with content on the same line (`<p>text</p>`) as *text*, which leaves it
// wrapped in the markdown paragraph that line produced.
const BLOCK_JSX_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'canvas', 'dd', 'details', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'header', 'hr', 'iframe', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'video',
]);

const JAVASCRIPT_URL = /^\s*javascript:/i;

function safeHref(href: unknown): string | undefined {
  if (typeof href !== 'string') return undefined;
  return JAVASCRIPT_URL.test(href) ? undefined : href;
}

/** Plain text of a hast subtree, used for heading slugs. */
function hastText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return String(node.value ?? '');
  if (Array.isArray(node.children)) return node.children.map(hastText).join('');
  return '';
}

/**
 * Lifts a block-level JSX tag out of the paragraph MDX left it in.
 *
 * `<p>text</p>` written on a single line is a *text* element to MDX, so it ends
 * up inside the paragraph that line produced. Rendering that as-is nests a `<p>`
 * in a `<p>`, which React rejects.
 */
function unwrapBlockJsx(node: any): void {
  if (!node || !Array.isArray(node.children)) return;

  const next: any[] = [];
  for (const child of node.children) {
    unwrapBlockJsx(child);

    if (child && child.type === 'element' && child.tagName === 'p' && Array.isArray(child.children)) {
      const meaningful = child.children.filter(
        (grandChild: any) => !(grandChild.type === 'text' && !String(grandChild.value ?? '').trim())
      );
      const only = meaningful.length === 1 ? meaningful[0] : null;
      if (only && only.type === 'mdxJsxTextElement' && BLOCK_JSX_TAGS.has(String(only.name))) {
        next.push(only);
        continue;
      }
    }

    next.push(child);
  }

  node.children = next;
}

/**
 * Stamps `id` on every heading, in document order, with the same slug and
 * de-duplication scheme `extractHeadings()` uses - the table of contents links
 * to these ids and the scroll-spy reads them back.
 */
function assignHeadingIds(tree: any): void {
  const counts = new Map<string, number>();

  const visit = (node: any) => {
    if (node && node.type === 'element' && HEADING_TAGS.has(node.tagName)) {
      const base = slugify(hastText(node)) || 'heading';
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);
      node.properties = { ...(node.properties ?? {}), id: seen === 0 ? base : `${base}-${seen}` };
    }
    if (node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  };

  visit(tree);
}

/** Resolves `<Name>` / `<Name.Sub>` against the document scope. */
function estreeName(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'Identifier') return String(node.name);
  if (node.type === 'Literal') return String(node.value);
  if (node.type === 'MemberExpression') {
    const object = estreeName(node.object);
    const property = estreeName(node.property);
    return object && property ? `${object}.${property}` : null;
  }
  return null;
}

function resolveComponent(expression: any, scope: Record<string, unknown>): unknown {
  const name = estreeName(expression);
  if (!name) return getUnknownComponent('unknown');

  const path = name.split('.');
  let current: any = Object.prototype.hasOwnProperty.call(scope, path[0]) ? scope[path[0]] : undefined;
  for (let index = 1; index < path.length && current != null; index++) {
    current = current[path[index]];
  }

  if (typeof current === 'function' || (current !== null && typeof current === 'object')) {
    return current;
  }
  return getUnknownComponent(name);
}

function isRenderableChild(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  const kind = typeof value;
  if (kind === 'string' || kind === 'number' || kind === 'boolean') return true;
  if (Array.isArray(value)) return value.every(isRenderableChild);
  return React.isValidElement(value);
}

/**
 * Turns the value of a body expression into something React can render, or
 * `undefined` (with a warning) when it cannot be.
 */
function toRenderableChild(
  value: unknown,
  slot: MdxExpressionSlot,
  warnings: MdxDiagnostic[]
): unknown {
  if (value === null || value === undefined || typeof value === 'boolean') return undefined;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (React.isValidElement(value)) return value;

  if (Array.isArray(value) && value.every(isRenderableChild)) {
    // Gives every produced element a key so React does not complain about the
    // list a `.map()` in the document just built.
    return React.Children.toArray(value as React.ReactNode[]);
  }

  warnings.push({
    message: `${slot.label}: the result is not something that can be rendered, so it was skipped`,
    point: slot.point,
  });
  return undefined;
}

interface BuiltDocument {
  element: React.ReactNode | null;
  error: MdxParseError | null;
  diagnostics: MdxDiagnostic[];
}

interface BuildOptions {
  body: string;
  lineOffset: number;
  components: MdxComponentMap;
  scope: Record<string, unknown>;
  expressions: MdxExpressionMode;
}

/**
 * Parses the body with the real MDX parser and turns the resulting tree into
 * React elements. No JavaScript is generated for the document itself; only the
 * `{...}` expressions inside it are evaluated, and only as far as
 * `expressions` allows.
 */
function buildDocument(options: BuildOptions): BuiltDocument {
  const ast = parseMdxDocument(options.body, { lineOffset: options.lineOffset });
  const warnings: MdxDiagnostic[] = [...ast.diagnostics];

  if (!ast.tree) {
    return { element: null, error: ast.error, diagnostics: warnings };
  }

  unwrapBlockJsx(ast.tree);
  assignHeadingIds(ast.tree);

  const evaluate: MdxExpressionEvaluator =
    options.expressions === 'literals'
      ? (expression: unknown): MdxExpressionResult => evaluateEstreeLiteral(expression)
      : createFullEstreeEvaluator({
          scope: options.scope,
          createElement: React.createElement as unknown as (
            type: unknown,
            props: unknown,
            ...children: unknown[]
          ) => unknown,
          Fragment: React.Fragment,
        });

  const evaluated = new Map<object, unknown>();

  const createEvaluater = () => ({
    evaluateExpression(expression: any): unknown {
      const slot = ast.slots.get(expression);

      // Not a slot: `hast-util-to-jsx-runtime` is asking us to resolve a
      // capitalized or dotted JSX tag name against the document scope.
      if (!slot) return resolveComponent(expression, options.scope);

      if (evaluated.has(expression)) return evaluated.get(expression);

      const result = evaluate(expression);
      let value: unknown;

      if (result.ok) {
        value =
          slot.kind === 'flow' || slot.kind === 'text'
            ? toRenderableChild(result.value, slot, warnings)
            : result.value;
      } else {
        warnings.push({ message: `${slot.label}: ${result.reason}`, point: slot.point });
        value = undefined;
      }

      evaluated.set(expression, value);
      return value;
    },
    evaluateProgram(): unknown {
      // Reached only for `import`/`export`, which the parser already removed.
      return undefined;
    },
  });

  try {
    const element = toJsxRuntime(ast.tree, {
      Fragment,
      jsx: jsx as never,
      jsxs: jsxs as never,
      components: options.components as never,
      createEvaluater,
      ignoreInvalidStyle: true,
      passKeys: true,
      passNode: true,
    });
    return { element, error: null, diagnostics: warnings };
  } catch (error) {
    const candidate = error as { reason?: string; message?: string; line?: number; column?: number };
    return {
      element: null,
      error: {
        message: candidate?.reason || candidate?.message || 'Could not render this document',
        point:
          typeof candidate?.line === 'number' && typeof candidate?.column === 'number'
            ? { line: candidate.line + options.lineOffset, column: candidate.column }
            : null,
      },
      diagnostics: warnings,
    };
  }
}

interface MdxRendererProps {
  content: string;
  themeConfig: ThemeConfig;
  showFrontmatterHeader?: boolean;
  containerId?: string;
  containerRef?: React.Ref<HTMLDivElement>;
  renderMode?: MdxRenderMode;
  /**
   * Components available to the document. Build it with
   * `createRendererRegistry(...)` so the built-ins stay included. Defaults to
   * the built-in components only - Mermaid, charts and flow graphs live in
   * separate packages and must be registered by the host.
   *
   * Pass a value that is stable across renders (a module-level constant):
   * a new registry object re-parses the document.
   */
  registry?: MdxRegistry;
  /**
   * How much of an MDX `{...}` expression to evaluate.
   *
   * `'full'` (the default) gives expressions real JavaScript semantics, which
   * is what an author of their own documents expects. `'literals'` restricts
   * them to values the syntax spells out and is the setting for rendering
   * content the host does not trust in-page.
   */
  expressions?: MdxExpressionMode;
}

export function MdxRenderer({
  content,
  themeConfig,
  showFrontmatterHeader = true,
  containerId,
  containerRef,
  renderMode = 'live',
  registry = baseMdxRegistry,
  expressions = 'full',
}: MdxRendererProps) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const renderSettings = useMemo(
    () => ({ renderMode, themeCategory: themeConfig.category }),
    [renderMode, themeConfig.category]
  );

  // Extract Frontmatter and Body
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);

  // The parser sees the body only, so every reported line has to be shifted
  // back onto the document the user is actually editing.
  const lineOffset = useMemo(
    () => countLines(content.slice(0, Math.max(0, content.length - body.length))),
    [content, body]
  );

  // `CodeBlock` is reachable from author JSX, so the scoped copy carries the
  // same registry the markdown pipeline uses.
  const ScopedCodeBlock = useMemo(
    () => (props: any) => <CodeBlock registry={registry} {...props} />,
    [registry]
  );

  // Element overrides. Everything the document renders - markdown-derived
  // elements and lowercase JSX tags alike - is looked up here.
  const components = useMemo(
    () => ({
      // Track <pre> block wrapper to differentiate block code from inline code
      pre: PreElement,

      // Paragraph override to avoid invalid HTML nesting of block elements inside <p>
      p: ({ children, node, ...props }: any) => {
        const hasBlockChild = React.Children.toArray(children).some((child: any) => {
          if (!child || typeof child !== 'object') return false;
          if (!React.isValidElement(child)) return false;

          // The parser already decided inline vs block: a tag used inside a
          // paragraph is a text element, one on its own is a flow element.
          const childNode = (child.props as any)?.node;
          if (childNode) {
            if (childNode.type === 'mdxJsxTextElement') {
              return BLOCK_JSX_TAGS.has(String(childNode.name));
            }
            if (childNode.type === 'mdxJsxFlowElement') return true;
            if (childNode.type === 'element') return !INLINE_TAGS.has(childNode.tagName);
          }

          if (child.type === CustomCodeElement) return false;
          if (typeof child.type === 'string') return !INLINE_TAGS.has(child.type);

          // Any custom React component (CodeBlock, Mermaid, StatGrid, ...) is a block element
          return true;
        });

        if (hasBlockChild) {
          return <div className="my-4 leading-relaxed" {...props}>{children}</div>;
        }

        return <p className="my-4 leading-relaxed" {...props}>{children}</p>;
      },

      // Heading anchors for scroll spy TOC. `id` is stamped on the tree before
      // rendering, in document order, so it matches extractHeadings().
      h1: ({ children, node, ...props }: any) => (
        <h1 className={`text-2xl sm:text-3xl font-bold my-6 pb-2 ${themeConfig.headingClass}`} {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, node, ...props }: any) => (
        <h2 className={`text-xl sm:text-2xl font-semibold my-5 pb-1.5 ${themeConfig.headingClass}`} {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, node, ...props }: any) => (
        <h3 className="text-lg font-semibold my-4" {...props}>
          {children}
        </h3>
      ),
      h4: ({ children, node, ...props }: any) => (
        <h4 className="text-base font-semibold my-3" {...props}>
          {children}
        </h4>
      ),

      // Code Block vs Inline Code override
      code: (props: any) => (
        <CustomCodeElement {...props} themeConfig={themeConfig} registry={registry} />
      ),

      // Table overrides with enhanced styling and borders
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
          <table className="w-full text-sm text-left border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }: any) => (
        <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
          {children}
        </thead>
      ),
      tbody: ({ children }: any) => (
        <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 bg-transparent text-slate-700 dark:text-slate-300">
          {children}
        </tbody>
      ),
      tr: ({ children }: any) => (
        <tr className="hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors duration-150">
          {children}
        </tr>
      ),
      th: ({ children, style }: any) => (
        <th
          style={style}
          className="px-4 py-3.5 sm:px-5 font-bold text-slate-900 dark:text-slate-100 border-r last:border-r-0 border-slate-200/70 dark:border-slate-700/70 whitespace-nowrap"
        >
          {children}
        </th>
      ),
      td: ({ children, style }: any) => (
        <td
          style={style}
          className="px-4 py-3 sm:px-5 sm:py-3.5 text-slate-700 dark:text-slate-300 border-r last:border-r-0 border-slate-200/50 dark:border-slate-800/50 leading-relaxed"
        >
          {children}
        </td>
      ),

      // Link override
      a: ({ children, href }: any) => (
        <a
          href={safeHref(href)}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium underline underline-offset-4 ${themeConfig.accentClass}`}
        >
          {children}
        </a>
      ),

      // Lists (ul, ol, li) overrides
      ul: ({ children, node, ...props }: any) => (
        <ul className="list-disc pl-6 my-4 space-y-1.5 marker:text-indigo-500 dark:marker:text-indigo-400" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, node, ...props }: any) => (
        <ol className="list-decimal pl-6 my-4 space-y-1.5 marker:text-indigo-500 dark:marker:text-indigo-400 font-medium" {...props}>
          {children}
        </ol>
      ),
      li: ({ children, node, ...props }: any) => (
        <li className="pl-1 leading-relaxed text-slate-700 dark:text-slate-300" {...props}>
          {children}
        </li>
      ),

      // Custom interactive component map
      ...registry.components,
    }),
    [themeConfig, registry]
  );

  /** Names a document may reference in JSX tags and in `{...}` expressions. */
  const scope = useMemo(
    () => ({ ...registry.components, CodeBlock: ScopedCodeBlock }),
    [registry, ScopedCodeBlock]
  );

  const rendered = useMemo(
    () =>
      buildDocument({
        body,
        lineOffset,
        components: components as unknown as MdxComponentMap,
        scope,
        expressions,
      }),
    [body, lineOffset, components, scope, expressions]
  );

  // A half-typed document must not blank the preview, so the last tree that did
  // parse stays on screen behind the warning banner.
  const lastGoodElement = useRef<React.ReactNode>(null);
  if (rendered.element !== null) lastGoodElement.current = rendered.element;
  const element = rendered.element ?? lastGoodElement.current;

  // A component that threw once must get another chance as soon as the document
  // changes, otherwise fixing the typo leaves the banner up forever.
  const errorForElement = useRef<React.ReactNode>(element);
  if (errorForElement.current !== element) {
    errorForElement.current = element;
    if (runtimeError !== null) setRuntimeError(null);
  }

  useEffect(() => {
    for (const diagnostic of rendered.diagnostics) {
      const where = diagnostic.point
        ? ` (line ${diagnostic.point.line}, column ${diagnostic.point.column})`
        : '';
      console.warn(`[@mdxkit/react] ${diagnostic.message}${where}`);
    }
  }, [rendered]);

  const parseError = rendered.error ? formatMdxParseError(rendered.error) : null;
  const banner = parseError ?? runtimeError;
  const isPdf = renderMode === 'pdf';

  return (
    <MdxRenderContext.Provider value={renderSettings}>
      <div
        id={containerId}
        ref={containerRef}
        data-mdx-render-mode={renderMode}
        className={
          isPdf
            ? `min-h-full p-6 sm:p-10 bg-white text-slate-900 ${themeConfig.fontFamily}`
            : `min-h-full p-6 sm:p-10 transition-colors duration-200 ${themeConfig.bgClass} ${themeConfig.textClass} ${themeConfig.fontFamily}`
        }
        style={{
          backgroundColor: isPdf ? '#ffffff' : themeConfig.previewBg,
          color: isPdf ? '#0f172a' : themeConfig.previewText,
        }}
      >
      {/* Frontmatter Banner Header */}
      {showFrontmatterHeader && frontmatter && (
        <FrontmatterHeader
          frontmatter={frontmatter}
          themeCategory={themeConfig.category}
          renderMode={renderMode}
        />
      )}

      {/* Located warning banner while the document does not parse */}
      {banner && (
        <div className="mb-4 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-mono flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Icons.AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span className="break-words">MDX: {banner.split('\n')[0]}</span>
          </div>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase shrink-0">
            {element ? 'Last good render' : 'Nothing to show'}
          </span>
        </div>
      )}

      {/* Main Render Canvas */}
      <div className={isPdf ? 'prose max-w-none' : 'prose dark:prose-invert max-w-none'}>
        <MdxErrorBoundary resetKey={element} onError={(e) => setRuntimeError(e.message)}>
          {element}
        </MdxErrorBoundary>
      </div>
      </div>
    </MdxRenderContext.Provider>
  );
}
