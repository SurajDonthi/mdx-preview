import React, { useContext, useEffect, useId, useMemo, useState } from 'react';
import mermaid from 'mermaid';
import * as Icons from 'lucide-react';
import { MdxRenderContext } from '@mdxkit/core';
import type { MdxRenderMode, MdxThemeCategory } from '@mdxkit/core';

export interface MermaidDiagramProps {
  chart?: string;
  children?: React.ReactNode;
  className?: string;
  renderMode?: MdxRenderMode;
  themeCategory?: MdxThemeCategory;
}

type MermaidRenderState = 'rendering' | 'ready' | 'error';

// Mermaid configuration is global, so initialize + render must stay serialized.
let mermaidRenderQueue: Promise<void> = Promise.resolve();
let mermaidRenderSequence = 0;

function renderMermaid(
  id: string,
  chartCode: string,
  renderMode: MdxRenderMode,
  themeCategory: MdxThemeCategory
): Promise<string> {
  const operation = mermaidRenderQueue.then(async () => {
    const isDark = renderMode === 'live' && themeCategory === 'dark';
    const renderHost = document.createElement('div');
    renderHost.dataset.mermaidRenderHost = id;
    renderHost.setAttribute('aria-hidden', 'true');
    Object.assign(renderHost.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '1200px',
      visibility: 'hidden',
      pointerEvents: 'none',
    });
    document.body.appendChild(renderHost);

    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'neutral',
        securityLevel: 'loose',
        suppressErrorRendering: true,
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        // Mermaid 11 gives the root setting precedence over the deprecated
        // flowchart option. SVG-only labels avoid foreignObject canvas tainting.
        htmlLabels: renderMode !== 'pdf',
        deterministicIds: renderMode === 'pdf',
        deterministicIDSeed: renderMode === 'pdf' ? id : undefined,
        flowchart: { htmlLabels: renderMode !== 'pdf' },
        themeVariables: isDark
          ? {
              primaryColor: '#1e293b',
              primaryTextColor: '#f8fafc',
              primaryBorderColor: '#475569',
              lineColor: '#818cf8',
            }
          : {
              primaryColor: '#e0e7ff',
              primaryTextColor: '#0f172a',
              primaryBorderColor: '#6366f1',
              lineColor: '#4f46e5',
              secondaryColor: '#f1f5f9',
              tertiaryColor: '#f8fafc',
              background: '#ffffff',
              mainBkg: '#e0e7ff',
              nodeBorder: '#6366f1',
              clusterBkg: '#f8fafc',
              clusterBorder: '#cbd5e1',
              defaultLinkColor: '#4f46e5',
              titleColor: '#0f172a',
              edgeLabelBackground: '#ffffff',
              actorBkg: '#e0e7ff',
              actorBorder: '#6366f1',
              actorTextColor: '#0f172a',
              signalColor: '#4f46e5',
              signalTextColor: '#0f172a',
              labelBoxBkgColor: '#e0e7ff',
              labelBoxBorderColor: '#6366f1',
              labelTextColor: '#0f172a',
            },
      });

      // Invalid definitions are rejected before Mermaid can create an error SVG.
      await mermaid.parse(chartCode, { suppressErrors: false });
      const renderId = `${id}-render-${++mermaidRenderSequence}`;
      const { svg } = await mermaid.render(renderId, chartCode, renderHost);
      return svg;
    } finally {
      renderHost.remove();
    }
  });
  mermaidRenderQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

export function MermaidDiagram({ chart, children, className = '', renderMode, themeCategory }: MermaidDiagramProps) {
  const context = useContext(MdxRenderContext);
  const effectiveRenderMode = renderMode ?? context.renderMode;
  const effectiveThemeCategory = themeCategory ?? context.themeCategory;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [renderState, setRenderState] = useState<MermaidRenderState>('rendering');
  const [copied, setCopied] = useState(false);
  const reactId = useId();
  const stableMermaidId = useMemo(
    () => `mermaid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [reactId]
  );
  const childText = React.Children.toArray(children)
    .filter((child): child is string | number => typeof child === 'string' || typeof child === 'number')
    .join('');
  const chartCode = (chart || childText || '').trim();
  const isPdf = effectiveRenderMode === 'pdf';

  useEffect(() => {
    let isActive = true;
    if (!chartCode) return () => { isActive = false; };
    setSvg('');
    setError(null);
    setRenderState('rendering');

    renderMermaid(stableMermaidId, chartCode, effectiveRenderMode, effectiveThemeCategory)
      .then((renderedSvg) => {
        if (!isActive) return;
        setSvg(renderedSvg);
        setRenderState('ready');
      })
      .catch((err: unknown) => {
        console.warn('Mermaid rendering error:', err);
        if (!isActive) return;
        setError(err instanceof Error ? err.message : 'Invalid Mermaid diagram syntax');
        setRenderState('error');
      });

    return () => { isActive = false; };
  }, [chartCode, effectiveRenderMode, effectiveThemeCategory, stableMermaidId]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chartCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!chartCode) return null;

  const outerClasses = isPdf
    ? 'my-6 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm text-slate-900'
    : 'my-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md overflow-hidden shadow-sm transition-colors';
  const headerClasses = isPdf
    ? 'flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 font-mono'
    : 'flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 font-mono';
  const canvasClasses = isPdf
    ? 'p-6 overflow-x-auto flex justify-center items-center min-h-[120px] bg-white'
    : 'p-6 overflow-x-auto custom-scrollbar flex justify-center items-center min-h-[120px] bg-white/50 dark:bg-slate-950/50';

  return (
    <div
      data-pdf-mermaid="true"
      data-mermaid-id={stableMermaidId}
      data-render-state={renderState}
      data-mermaid-error={renderState === 'error' ? 'true' : undefined}
      data-error-message={error || undefined}
      className={`${outerClasses} ${className}`}
    >
      <div className={headerClasses}>
        <span className={`flex items-center gap-2 font-medium ${isPdf ? 'text-slate-700' : 'text-slate-700 dark:text-slate-300'}`}>
          <Icons.GitFork className={`w-3.5 h-3.5 ${isPdf ? 'text-indigo-500' : 'text-indigo-500 dark:text-indigo-400'}`} />
          <span>Mermaid Diagram</span>
        </span>
        {!isPdf && <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          title="Copy Mermaid Code"
        >
          {copied ? (
            <>
              <Icons.Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Icons.Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </>
          )}
        </button>}
      </div>

      <div className={canvasClasses}>
        {error ? (
          <div
            data-mermaid-error-message="true"
            role="alert"
            className={`w-full p-4 rounded-xl border text-xs font-mono ${isPdf ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300'}`}
          >
            <div className={`flex items-center gap-2 font-semibold mb-1 ${isPdf ? 'text-amber-700' : 'text-amber-600 dark:text-amber-400'}`}>
              <Icons.AlertTriangle className="w-4 h-4" />
              <span>Mermaid Diagram Error</span>
            </div>
            <pre className={`whitespace-pre-wrap text-[11px] mt-2 ${isPdf ? 'text-amber-800' : 'text-amber-700 dark:text-amber-200/80'}`}>{error}</pre>
            <details className="mt-3 text-[11px] cursor-pointer">
              <summary className={isPdf ? 'text-amber-700' : 'text-amber-600 dark:text-amber-400 hover:underline'}>View raw syntax</summary>
              <pre className={`p-2 mt-1 rounded ${isPdf ? 'bg-slate-100 text-slate-800' : 'bg-slate-100 dark:bg-slate-900 text-slate-800 dark:text-slate-300'}`}>{chartCode}</pre>
            </details>
          </div>
        ) : svg ? (
          <div
            className="mermaid-svg-container w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className={`flex items-center gap-2 text-xs py-4 ${isPdf ? 'text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
            <Icons.Loader2 className={`w-4 h-4 text-indigo-500 ${isPdf ? '' : 'animate-spin'}`} />
            <span>Rendering diagram...</span>
          </div>
        )}
      </div>
    </div>
  );
}
