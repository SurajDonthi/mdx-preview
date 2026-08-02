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
import { MermaidDiagram } from './MermaidDiagram';
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

interface MdxRendererProps {
  content: string;
  themeConfig: ThemeConfig;
  showFrontmatterHeader?: boolean;
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
    <code
      className={`px-1.5 py-0.5 mx-0.5 rounded-md text-[0.85em] leading-tight font-mono font-medium border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-800/80 text-indigo-700 dark:text-cyan-300 inline-block align-baseline ${themeConfig.codeBgClass} ${themeConfig.codeTextClass}`}
      {...props}
    >
      {children}
    </code>
  );
}

interface MdxRendererProps {
  content: string;
  themeConfig: ThemeConfig;
  showFrontmatterHeader?: boolean;
  containerId?: string;
}

export function MdxRenderer({
  content,
  themeConfig,
  showFrontmatterHeader = true,
  containerId = 'mdx-preview-content',
}: MdxRendererProps) {
  const [parseError, setParseError] = useState<string | null>(null);

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

  return (
    <div
      id={containerId}
      className={`min-h-full p-6 sm:p-10 transition-colors duration-200 ${themeConfig.bgClass} ${themeConfig.textClass} ${themeConfig.fontFamily}`}
      style={{
        backgroundColor: themeConfig.previewBg,
        color: themeConfig.previewText,
      }}
    >
      {/* Frontmatter Banner Header */}
      {showFrontmatterHeader && frontmatter && (
        <FrontmatterHeader
          frontmatter={frontmatter}
          themeCategory={themeConfig.category}
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
      <div className="prose dark:prose-invert max-w-none">
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
  );
}

/**
 * Parses MDX body into structured blocks of JSX components and Markdown text.
 * Accurately tracks nested JSX tags and self-closing components.
 */
function parseMdxBlocks(mdx: string): { type: 'jsx' | 'markdown'; content: string }[] {
  const blocks: { type: 'jsx' | 'markdown'; content: string }[] = [];
  let index = 0;
  let markdownBuffer = '';

  // Match opening tag of a capitalized custom component e.g. <Callout or <StatGrid
  const tagStartRegex = /<([A-Z][a-zA-Z0-9]*)(?:\s+[^>]*|\s*)>/g;

  while (index < mdx.length) {
    tagStartRegex.lastIndex = index;
    const match = tagStartRegex.exec(mdx);

    if (!match) {
      markdownBuffer += mdx.slice(index);
      break;
    }

    const matchStart = match.index;
    const tagName = match[1];
    const fullOpeningTag = match[0];

    // Check if the component tag is self-closing e.g. <Chart type="bar" />
    if (fullOpeningTag.endsWith('/>')) {
      if (matchStart > index) {
        markdownBuffer += mdx.slice(index, matchStart);
      }
      if (markdownBuffer) {
        blocks.push({ type: 'markdown', content: markdownBuffer });
        markdownBuffer = '';
      }
      blocks.push({ type: 'jsx', content: fullOpeningTag });
      index = matchStart + fullOpeningTag.length;
      continue;
    }

    // Paired tag e.g. <StatGrid ...>. Track nesting depth to locate matching </StatGrid>
    let depth = 1;
    let searchPos = matchStart + fullOpeningTag.length;
    let endPos = -1;

    const tagSearchRegex = new RegExp(`<(/?)${tagName}(?:\\s+[^>]*|\\s*)>`, 'g');
    tagSearchRegex.lastIndex = searchPos;

    let subMatch;
    while ((subMatch = tagSearchRegex.exec(mdx)) !== null) {
      const isClosing = subMatch[1] === '/';
      const isSelfClosing = subMatch[0].endsWith('/>');

      if (isClosing) {
        depth--;
      } else if (!isSelfClosing) {
        depth++;
      }

      if (depth === 0) {
        endPos = subMatch.index + subMatch[0].length;
        break;
      }
    }

    if (endPos !== -1) {
      if (matchStart > index) {
        markdownBuffer += mdx.slice(index, matchStart);
      }
      if (markdownBuffer) {
        blocks.push({ type: 'markdown', content: markdownBuffer });
        markdownBuffer = '';
      }
      blocks.push({ type: 'jsx', content: mdx.slice(matchStart, endPos) });
      index = endPos;
    } else {
      // Unclosed tag (typing in progress or raw markdown text). Keep in markdown buffer.
      markdownBuffer += mdx.slice(index, matchStart + fullOpeningTag.length);
      index = matchStart + fullOpeningTag.length;
    }
  }

  if (markdownBuffer) {
    blocks.push({ type: 'markdown', content: markdownBuffer });
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
