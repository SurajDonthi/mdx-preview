import React, { useState, useCallback, useEffect, useMemo, useRef, Component, ErrorInfo } from 'react';
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
  collectHeadings,
  parseMdxDocument,
  formatMdxParseError,
  countLines,
  evaluateEstreeLiteral,
  createFullEstreeEvaluator,
} from '@mdxstudio/core';
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
} from '@mdxstudio/core';
import { FrontmatterHeader } from './FrontmatterHeader';
import { baseMdxRegistry } from './plugin';
import { InlineToken } from './InlineToken';
import { ImageLightbox, MdxImage } from './Lightbox';
import type { LightboxImage, OpenLightbox } from './Lightbox';
import { AlertTriangle, Check, Copy, HelpCircle } from 'lucide-react';

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
        <div className="mdxstudio-alert mdxstudio-alert--boundary">
          <div className="mdxstudio-alert__title">
            <AlertTriangle className="mdxstudio-icon-16 mdxstudio-alert__icon" />
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
    <div className="mdxstudio-code">
      {/* Code Header Bar */}
      <div className="mdxstudio-code__header">
        <span className="mdxstudio-code__dots">
          <span className="mdxstudio-code__dot mdxstudio-code__dot--red" />
          <span className="mdxstudio-code__dot mdxstudio-code__dot--amber" />
          <span className="mdxstudio-code__dot mdxstudio-code__dot--green" />
          <span className="mdxstudio-code__lang">{cleanLang}</span>
        </span>
        <button onClick={handleCopy} className="mdxstudio-code__copy">
          {copied ? (
            <>
              <Check className="mdxstudio-icon-14 mdxstudio-code__copied" />
              <span className="mdxstudio-code__copied">Copied</span>
            </>
          ) : (
            <>
              <Copy className="mdxstudio-icon-14" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Highlighting Content */}
      <div className="mdxstudio-code__body mdxstudio-scrollbar">
        <pre className="mdxstudio-code__pre">
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

  // Inline code rendering. A backtick span follows the theme preset's own code
  // colours - `--mdxstudio-inline-code-*`, set on the renderer root - which is what
  // threading `codeBgClass`/`codeTextClass` through here used to achieve.
  return (
    <InlineToken
      as="code"
      kind="code"
      tone={themeConfig.category}
      appearanceClassName="mdxstudio-token--themed"
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
      <span data-mdx-unknown-component={name} className="mdxstudio-unknown">
        <HelpCircle className="mdxstudio-icon-14 mdxstudio-shrink-0" />
        <span>
          Unknown component <strong>{`<${name}>`}</strong>
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
 * Stamps `id` on every heading in the tree.
 *
 * The ids come from `collectHeadings()`, which is also what the table of
 * contents links to and what the scroll-spy reads back, so the two cannot
 * disagree about what a heading is called.
 */
function assignHeadingIds(tree: any): void {
  for (const heading of collectHeadings(tree)) {
    const node = heading.node as { properties?: Record<string, unknown> };
    node.properties = { ...(node.properties ?? {}), id: heading.id };
  }
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
  registry: MdxRegistry;
}

/**
 * Parses the body with the real MDX parser and turns the resulting tree into
 * React elements. No JavaScript is generated for the document itself; only the
 * `{...}` expressions inside it are evaluated, and only as far as
 * `expressions` allows.
 */
function buildDocument(options: BuildOptions): BuiltDocument {
  const ast = parseMdxDocument(options.body, {
    lineOffset: options.lineOffset,
    // The registry decides the syntax as well as the vocabulary: a plugin that
    // contributes a remark transform has to reach the parse, not just the
    // component lookup.
    remarkPlugins: options.registry.remarkPlugins,
    rehypePlugins: options.registry.rehypePlugins,
  });
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
  /**
   * Clicking an image opens it enlarged in an overlay. On by default; turn it
   * off for a host that has its own image viewer, or where the document is not
   * the whole page. Always off in `pdf` mode, where nothing can be clicked.
   */
  lightbox?: boolean;
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
  lightbox = true,
}: MdxRendererProps) {
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<LightboxImage | null>(null);

  // The element the overlay was opened from, so focus can go back to it. A ref
  // rather than state: it is never read during a render.
  const zoomOrigin = useRef<HTMLElement | null>(null);

  const openZoom = useCallback<OpenLightbox>((image, origin) => {
    zoomOrigin.current = origin;
    setZoomed(image);
  }, []);

  const closeZoom = useCallback(() => {
    const origin = zoomOrigin.current;
    zoomOrigin.current = null;
    setZoomed(null);
    // Still in the document at this point: React removes the overlay after the
    // handler returns, so the image is there to take focus back.
    if (origin?.isConnected) origin.focus();
  }, []);

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

  // Nothing in an exported PDF can be clicked, and the overlay would be a
  // full-page rectangle in the middle of it.
  const zoomable = lightbox && renderMode !== 'pdf' ? openZoom : undefined;

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
          return <div className="mdxstudio-p" {...props}>{children}</div>;
        }

        return <p className="mdxstudio-p" {...props}>{children}</p>;
      },

      // Heading anchors for scroll spy TOC. `id` is stamped on the tree before
      // rendering, in document order, so it matches extractHeadings().
      h1: ({ children, node, ...props }: any) => (
        <h1 className="mdxstudio-heading mdxstudio-heading--1" {...props}>
          {children}
        </h1>
      ),
      h2: ({ children, node, ...props }: any) => (
        <h2 className="mdxstudio-heading mdxstudio-heading--2" {...props}>
          {children}
        </h2>
      ),
      h3: ({ children, node, ...props }: any) => (
        <h3 className="mdxstudio-heading mdxstudio-heading--3" {...props}>
          {children}
        </h3>
      ),
      h4: ({ children, node, ...props }: any) => (
        <h4 className="mdxstudio-heading mdxstudio-heading--4" {...props}>
          {children}
        </h4>
      ),

      // Code Block vs Inline Code override
      code: (props: any) => (
        <CustomCodeElement {...props} themeConfig={themeConfig} registry={registry} />
      ),

      // Table overrides with enhanced styling and borders
      table: ({ children }: any) => (
        <div className="mdxstudio-table-wrap">
          <table className="mdxstudio-table">{children}</table>
        </div>
      ),
      thead: ({ children }: any) => <thead className="mdxstudio-thead">{children}</thead>,
      tbody: ({ children }: any) => <tbody className="mdxstudio-tbody">{children}</tbody>,
      tr: ({ children }: any) => <tr className="mdxstudio-tr">{children}</tr>,
      th: ({ children, style }: any) => (
        <th style={style} className="mdxstudio-th">
          {children}
        </th>
      ),
      td: ({ children, style }: any) => (
        <td style={style} className="mdxstudio-td">
          {children}
        </td>
      ),

      // Images open enlarged unless the host turned that off.
      img: ({ node, ...props }: any) => <MdxImage {...props} onOpen={zoomable} />,

      // Link override
      a: ({ children, href }: any) => (
        <a
          href={safeHref(href)}
          target="_blank"
          rel="noopener noreferrer"
          className="mdxstudio-link"
        >
          {children}
        </a>
      ),

      // Lists (ul, ol, li) overrides
      ul: ({ children, node, ...props }: any) => (
        <ul className="mdxstudio-list mdxstudio-list--ul" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, node, ...props }: any) => (
        <ol className="mdxstudio-list mdxstudio-list--ol" {...props}>
          {children}
        </ol>
      ),
      li: ({ children, node, ...props }: any) => (
        <li className="mdxstudio-li" {...props}>
          {children}
        </li>
      ),

      // Custom interactive component map
      ...registry.components,
    }),
    [themeConfig, registry, zoomable]
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
        registry,
      }),
    [body, lineOffset, components, scope, expressions, registry]
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
      console.warn(`[@mdxstudio/react] ${diagnostic.message}${where}`);
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
        // The single signal every themed rule in the shipped stylesheets keys
        // off. It comes from the application's own theme, never from
        // `prefers-color-scheme`, and it is declared here rather than on the
        // document root so the PDF exporter's detached clone still resolves it.
        data-mdxstudio-theme={isPdf ? 'light' : themeConfig.category}
        className="mdxstudio-root"
        style={{
          // The preset's own properties are declared even for the export pass:
          // it overrides colour, background and blur with `!important` anyway,
          // and what is left - the font stack - is what the export used to keep.
          ...(themeConfig.cssVars as React.CSSProperties | undefined),
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
        <div className="mdxstudio-alert mdxstudio-alert--banner">
          <div className="mdxstudio-alert__body">
            <AlertTriangle className="mdxstudio-icon-16 mdxstudio-alert__body-icon" />
            <span className="mdxstudio-alert__message">MDX: {banner.split('\n')[0]}</span>
          </div>
          <span className="mdxstudio-alert__meta">
            {element ? 'Last good render' : 'Nothing to show'}
          </span>
        </div>
      )}

      {/* Main Render Canvas */}
      <div className="mdxstudio-prose">
        <MdxErrorBoundary resetKey={element} onError={(e) => setRuntimeError(e.message)}>
          {element}
        </MdxErrorBoundary>
      </div>

      {/* Enlarged image. Inside the themed root, so it reads the same
          properties everything else does. */}
      {zoomed && <ImageLightbox image={zoomed} onClose={closeZoom} />}
      </div>
    </MdxRenderContext.Provider>
  );
}
