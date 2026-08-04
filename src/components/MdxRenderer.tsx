import React, { useState, useEffect, useMemo, useRef, Component, ErrorInfo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
import * as Babel from '@babel/standalone';

import { ThemeConfig, HeaderItem } from '../types';
import { parseFrontmatter, slugify } from '../utils/mdxParser';
import { FrontmatterHeader } from './FrontmatterHeader';
import { mdxComponentsMap } from './CustomComponents';
import { InlineToken } from './InlineToken';
import { MermaidDiagram, MdxRenderContext, MdxRenderMode } from './MermaidDiagram';
import * as Icons from 'lucide-react';

// Error Boundary for compiled MDX elements
class MdxErrorBoundary extends Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
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
            <span>MDX Expression Syntax Warning</span>
          </div>
          <div>{this.state.error?.message || 'Syntax error in JSX expression while typing.'}</div>
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
  themeConfig,
}: {
  language?: string;
  value: string;
  themeConfig: ThemeConfig;
}) {
  const [copied, setCopied] = useState(false);

  const cleanLang = (language || 'text').toLowerCase();

  if (cleanLang === 'mermaid') {
    return <MermaidDiagram chart={value} />;
  }

  const highlightedCode = useMemo(() => {
    try {
      const grammar = Prism.languages[cleanLang] || Prism.languages.text || Prism.languages.javascript;
      return Prism.highlight(value, grammar, cleanLang);
    } catch {
      return value;
    }
  }, [value, cleanLang]);

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
  ...props
}: any) {
  const isInsidePre = React.useContext(PreContext);
  const match = /language-(\w+)/.exec(className || '');
  const value = String(children).replace(/\n$/, '');
  const cleanLang = (match ? match[1] : '').toLowerCase();

  // Code block condition: inside <pre>, explicit language tag, or multiline code
  const isBlock = isInsidePre || Boolean(match) || value.includes('\n');

  if (isBlock) {
    if (cleanLang === 'mermaid') {
      return <MermaidDiagram chart={value} />;
    }
    return (
      <CodeBlock
        language={cleanLang}
        value={value}
        themeConfig={themeConfig}
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

interface MdxRendererProps {
  content: string;
  themeConfig: ThemeConfig;
  showFrontmatterHeader?: boolean;
  containerId?: string;
  containerRef?: React.Ref<HTMLDivElement>;
  renderMode?: MdxRenderMode;
}

export function MdxRenderer({
  content,
  themeConfig,
  showFrontmatterHeader = true,
  containerId,
  containerRef,
  renderMode = 'live',
}: MdxRendererProps) {
  const [parseError, setParseError] = useState<string | null>(null);
  const renderSettings = useMemo(
    () => ({ renderMode, themeCategory: themeConfig.category }),
    [renderMode, themeConfig.category]
  );

  // Extract Frontmatter and Body
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);

  // Heading counter for unique IDs
  const headingSlugCounts = useRef<Record<string, number>>({});
  headingSlugCounts.current = {};

  const getHeadingId = (text: string) => {
    const slug = slugify(text) || 'heading';
    const count = headingSlugCounts.current[slug] || 0;
    headingSlugCounts.current[slug] = count + 1;
    return count === 0 ? slug : `${slug}-${count}`;
  };

  // Shared ReactMarkdown components mapping with <pre> unwrapped to prevent <div> inside <pre>/<p> hydration errors
  const customMdComponents = useMemo(
    () => ({
      // Track <pre> block wrapper to differentiate block code from inline code
      pre: PreElement,

      // Paragraph override to avoid invalid HTML nesting of block elements inside <p>
      p: ({ children, ...props }: any) => {
        const hasBlockChild = React.Children.toArray(children).some((child: any) => {
          if (!child) return false;
            if (React.isValidElement(child)) {
              const type = child.type;
              if (type === CustomCodeElement) return false;
              if (typeof type === 'string') {
              const inlineTags = ['a', 'span', 'strong', 'em', 'b', 'i', 'code', 'small', 'sub', 'sup', 'mark'];
              return !inlineTags.includes(type);
            }
            // Any custom React component (CodeBlock, Mermaid, StatGrid, Callout, etc.) is a block element
            return true;
          }
          return false;
        });

        if (hasBlockChild) {
          return <div className="my-4 leading-relaxed" {...props}>{children}</div>;
        }

        return <p className="my-4 leading-relaxed" {...props}>{children}</p>;
      },

      // Heading anchors for scroll spy TOC
      h1: ({ children, ...props }: any) => {
        const text = String(children);
        const id = getHeadingId(text);
        return (
          <h1
            id={id}
            className={`text-2xl sm:text-3xl font-bold my-6 pb-2 ${themeConfig.headingClass}`}
            {...props}
          >
            {children}
          </h1>
        );
      },
      h2: ({ children, ...props }: any) => {
        const text = String(children);
        const id = getHeadingId(text);
        return (
          <h2
            id={id}
            className={`text-xl sm:text-2xl font-semibold my-5 pb-1.5 ${themeConfig.headingClass}`}
            {...props}
          >
            {children}
          </h2>
        );
      },
      h3: ({ children, ...props }: any) => {
        const text = String(children);
        const id = getHeadingId(text);
        return (
          <h3 id={id} className="text-lg font-semibold my-4" {...props}>
            {children}
          </h3>
        );
      },
      h4: ({ children, ...props }: any) => {
        const text = String(children);
        const id = getHeadingId(text);
        return (
          <h4 id={id} className="text-base font-semibold my-3" {...props}>
            {children}
          </h4>
        );
      },

      // Code Block vs Inline Code override
      code: (props: any) => <CustomCodeElement {...props} themeConfig={themeConfig} />,

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
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`font-medium underline underline-offset-4 ${themeConfig.accentClass}`}
        >
          {children}
        </a>
      ),

      // Lists (ul, ol, li) overrides
      ul: ({ children, ...props }: any) => (
        <ul className="list-disc pl-6 my-4 space-y-1.5 marker:text-indigo-500 dark:marker:text-indigo-400" {...props}>
          {children}
        </ul>
      ),
      ol: ({ children, ...props }: any) => (
        <ol className="list-decimal pl-6 my-4 space-y-1.5 marker:text-indigo-500 dark:marker:text-indigo-400 font-medium" {...props}>
          {children}
        </ol>
      ),
      li: ({ children, ...props }: any) => (
        <li className="pl-1 leading-relaxed text-slate-700 dark:text-slate-300" {...props}>
          {children}
        </li>
      ),

      // Custom interactive component map
      ...mdxComponentsMap,
    }),
    [themeConfig]
  );

  // Attempt Babel live transform of MDX/JSX
  const CompiledComponent = useMemo(() => {
    setParseError(null);
    if (!body.trim()) return null;

    try {
      // Convert MDX body into valid JSX string for Babel execution
      const jsxCode = convertMdxToJsx(body);

      const transpiled = Babel.transform(
        `
        function MdxView() {
          return (
            <React.Fragment>
              ${jsxCode}
            </React.Fragment>
          );
        }
        `,
        {
          presets: ['react'],
          filename: 'mdxView.jsx',
        }
      ).code;

      // Construct live component function with full scope injected
      const scope = {
        React,
        useState,
        useEffect,
        ReactMarkdown,
        remarkGfm,
        customMdComponents,
        CodeBlock,
        ...mdxComponentsMap,
      };

      const scopeKeys = Object.keys(scope);
      const scopeValues = Object.values(scope);

      // Evaluate transpiled function
      const componentFactory = new Function(...scopeKeys, `${transpiled}; return MdxView;`);
      return componentFactory(...scopeValues);
    } catch (err: any) {
      // Catch compilation error (e.g. unclosed tag while typing)
      setParseError(err.message || 'Syntax error while parsing JSX');
      return null;
    }
  }, [body, customMdComponents]);

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

      {/* Parse Error Warning Banner if MDX JSX expression is incomplete */}
      {parseError && (
        <div className="mb-4 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>MDX JSX Warning: {parseError.split('\n')[0]}</span>
          </div>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase">
            Fallback View Active
          </span>
        </div>
      )}

      {/* Main Render Canvas */}
      <div className={isPdf ? 'prose max-w-none' : 'prose dark:prose-invert max-w-none'}>
        {CompiledComponent ? (
          <MdxErrorBoundary onError={(e) => setParseError(e.message)}>
            <CompiledComponent />
          </MdxErrorBoundary>
        ) : (
          /* Fallback React Markdown Engine */
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={customMdComponents}>
            {body}
          </ReactMarkdown>
        )}
      </div>
      </div>
    </MdxRenderContext.Provider>
  );
}

interface MdxJsxTag {
  name: string;
  start: number;
  end: number;
  closing: boolean;
  selfClosing: boolean;
}

function countRun(source: string, start: number, character: string): number {
  let end = start;
  while (source[end] === character) end++;
  return end - start;
}

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor--) slashes++;
  return slashes % 2 === 1;
}

/** Returns the end of a Markdown code span/fence starting at `start`, or `start`. */
function skipMarkdownCode(source: string, start: number): number {
  const marker = source[start];
  if (marker !== '`' && marker !== '~') return start;

  const markerLength = countRun(source, start, marker);
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const linePrefix = source.slice(lineStart, start);
  const isFence = markerLength >= 3 && /^[ \t]{0,3}$/.test(linePrefix);

  if (isFence) {
    let cursor = source.indexOf('\n', start + markerLength);
    if (cursor === -1) return source.length;
    cursor++;

    while (cursor < source.length) {
      const nextLine = source.indexOf('\n', cursor);
      const lineEnd = nextLine === -1 ? source.length : nextLine;
      const line = source.slice(cursor, lineEnd);
      const indentation = /^[ \t]{0,3}/.exec(line)?.[0].length ?? 0;
      const fenceLength = countRun(line, indentation, marker);
      if (fenceLength >= markerLength && line.slice(indentation + fenceLength).trim() === '') {
        return nextLine === -1 ? source.length : nextLine + 1;
      }
      cursor = nextLine === -1 ? source.length : nextLine + 1;
    }
    return source.length;
  }

  if (marker !== '`') return start;

  // A code span never contains a blank line, so the search for the closing run
  // must stop there. Without this bound an unpaired run (for example a literal
  // ``` written mid-sentence) swallows the next fence opener, which shifts the
  // fence closer into the opener role and hides the JSX that follows it.
  const runEnd = start + markerLength;
  const blankLine = source.slice(runEnd).search(/\n[ \t]*\r?\n/);
  const limit = blankLine === -1 ? source.length : runEnd + blankLine;

  let cursor = runEnd;
  while (cursor < limit) {
    const next = source.indexOf('`', cursor);
    if (next === -1 || next >= limit) break;
    const closingLength = countRun(source, next, '`');
    if (closingLength === markerLength) return next + markerLength;
    cursor = next + closingLength;
  }

  // Unpaired run: the backticks are literal text. Consume just the run so the
  // following runs can still pair with each other.
  return runEnd;
}

/** Reads a capitalized MDX JSX tag without treating `>` inside attributes as its end. */
function readMdxJsxTag(source: string, start: number): MdxJsxTag | null {
  if (source[start] !== '<' || isEscaped(source, start)) return null;
  let cursor = start + 1;
  const closing = source[cursor] === '/';
  if (closing) cursor++;

  const nameMatch = /^[A-Z][a-zA-Z0-9.]*/.exec(source.slice(cursor));
  if (!nameMatch) return null;
  const name = nameMatch[0];
  cursor += name.length;

  let quote: '"' | "'" | '`' | null = null;
  let escaped = false;
  let braceDepth = 0;

  while (cursor < source.length) {
    const character = source[cursor];
    if (escaped) {
      escaped = false;
      cursor++;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      cursor++;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      cursor++;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      cursor++;
      continue;
    }
    if (character === '{') {
      braceDepth++;
      cursor++;
      continue;
    }
    if (character === '}' && braceDepth > 0) {
      braceDepth--;
      cursor++;
      continue;
    }
    if (character === '>' && braceDepth === 0) {
      const beforeClose = source.slice(start, cursor).trimEnd();
      return {
        name,
        start,
        end: cursor + 1,
        closing,
        selfClosing: !closing && beforeClose.endsWith('/'),
      };
    }
    cursor++;
  }

  return null;
}

function findMatchingMdxJsxEnd(source: string, opening: MdxJsxTag): number {
  let depth = 1;
  let cursor = opening.end;

  while (cursor < source.length) {
    const codeEnd = skipMarkdownCode(source, cursor);
    if (codeEnd > cursor) {
      cursor = codeEnd;
      continue;
    }
    if (source.startsWith('<!--', cursor)) {
      const commentEnd = source.indexOf('-->', cursor + 4);
      cursor = commentEnd === -1 ? source.length : commentEnd + 3;
      continue;
    }
    if (source[cursor] === '<') {
      const tag = readMdxJsxTag(source, cursor);
      if (tag?.name === opening.name) {
        if (tag.closing) depth--;
        else if (!tag.selfClosing) depth++;
        if (depth === 0) return tag.end;
      }
      if (tag) {
        cursor = tag.end;
        continue;
      }
    }
    cursor++;
  }

  return -1;
}

/**
 * Splits Markdown and executable MDX JSX while respecting fenced/inline code.
 * Component examples remain text, and `>` inside JSX expressions stays intact.
 */
function parseMdxBlocks(mdx: string): { type: 'jsx' | 'markdown'; content: string }[] {
  const blocks: { type: 'jsx' | 'markdown'; content: string }[] = [];
  let markdownStart = 0;
  let cursor = 0;

  while (cursor < mdx.length) {
    const codeEnd = skipMarkdownCode(mdx, cursor);
    if (codeEnd > cursor) {
      cursor = codeEnd;
      continue;
    }
    if (mdx.startsWith('<!--', cursor)) {
      const commentEnd = mdx.indexOf('-->', cursor + 4);
      cursor = commentEnd === -1 ? mdx.length : commentEnd + 3;
      continue;
    }

    const opening = readMdxJsxTag(mdx, cursor);
    if (!opening || opening.closing) {
      cursor++;
      continue;
    }

    const blockEnd = opening.selfClosing ? opening.end : findMatchingMdxJsxEnd(mdx, opening);
    if (blockEnd === -1) {
      cursor = opening.end;
      continue;
    }

    if (cursor > markdownStart) {
      blocks.push({ type: 'markdown', content: mdx.slice(markdownStart, cursor) });
    }
    blocks.push({ type: 'jsx', content: mdx.slice(cursor, blockEnd) });
    cursor = blockEnd;
    markdownStart = blockEnd;
  }

  if (markdownStart < mdx.length) {
    blocks.push({ type: 'markdown', content: mdx.slice(markdownStart) });
  }

  return blocks;
}

/**
 * Converts MDX body into valid JSX string for Babel execution
 */
function convertMdxToJsx(mdx: string): string {
  const blocks = parseMdxBlocks(mdx);

  return blocks
    .map((block) => {
      if (block.type === 'jsx') {
        return block.content;
      }
      const escapedMarkdown = JSON.stringify(block.content);
      return `<ReactMarkdown remarkPlugins={[remarkGfm]} components={customMdComponents}>{${escapedMarkdown}}</ReactMarkdown>`;
    })
    .join('\n');
}
