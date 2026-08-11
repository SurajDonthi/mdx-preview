import React, { useContext, useEffect, useId, useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, GitFork, Loader2 } from 'lucide-react';
import { MdxRenderContext } from '@mdxstudio/core';
import type { MdxRenderMode, MdxThemeCategory } from '@mdxstudio/core';

export interface MermaidDiagramProps {
  chart?: string;
  children?: React.ReactNode;
  className?: string;
  renderMode?: MdxRenderMode;
  themeCategory?: MdxThemeCategory;
}

type MermaidRenderState = 'rendering' | 'ready' | 'error';

type MermaidApi = Awaited<typeof import('mermaid')>['default'];

/**
 * Mermaid is ~3 MB of parsers, layout engines and fonts - more than the rest of
 * mdxstudio put together. Importing it here rather than at module scope means the
 * cost lands on the first document that actually contains a diagram; registering
 * `mermaidPlugin` costs nothing until then. The promise is memoised so N
 * diagrams on a page share one load.
 */
let mermaidModule: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  mermaidModule ??= import('mermaid').then((module) => module.default);
  return mermaidModule;
}

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
    const mermaid = await loadMermaid();
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

  return (
    <div
      data-pdf-mermaid="true"
      data-mermaid-id={stableMermaidId}
      data-render-state={renderState}
      data-mermaid-error={renderState === 'error' ? 'true' : undefined}
      data-error-message={error || undefined}
      className={`mdxstudio-mermaid${isPdf ? ' mdxstudio-mermaid--pdf' : ''} ${className}`.trim()}
    >
      <div className="mdxstudio-mermaid__header">
        <span className="mdxstudio-mermaid__title">
          <GitFork className="mdxstudio-mermaid__icon-14 mdxstudio-mermaid__title-icon" />
          <span>Mermaid Diagram</span>
        </span>
        {!isPdf && <button
          onClick={handleCopy}
          className="mdxstudio-mermaid__copy"
          title="Copy Mermaid Code"
        >
          {copied ? (
            <>
              <Check className="mdxstudio-mermaid__icon-14 mdxstudio-mermaid__copied" />
              <span className="mdxstudio-mermaid__copied">Copied</span>
            </>
          ) : (
            <>
              <Copy className="mdxstudio-mermaid__icon-14" />
              <span>Copy Code</span>
            </>
          )}
        </button>}
      </div>

      <div className="mdxstudio-mermaid__canvas">
        {error ? (
          <div data-mermaid-error-message="true" role="alert" className="mdxstudio-mermaid__error">
            <div className="mdxstudio-mermaid__error-title">
              <AlertTriangle className="mdxstudio-mermaid__icon-16" />
              <span>Mermaid Diagram Error</span>
            </div>
            <pre className="mdxstudio-mermaid__error-detail">{error}</pre>
            <details className="mdxstudio-mermaid__error-more">
              <summary className="mdxstudio-mermaid__error-summary">View raw syntax</summary>
              <pre className="mdxstudio-mermaid__error-raw">{chartCode}</pre>
            </details>
          </div>
        ) : svg ? (
          <div
            className="mermaid-svg-container"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="mdxstudio-mermaid__pending">
            <Loader2
              className={`mdxstudio-mermaid__icon-16 mdxstudio-mermaid__spinner${
                isPdf ? '' : ' mdxstudio-mermaid__spinner--busy'
              }`}
            />
            <span>Rendering diagram...</span>
          </div>
        )}
      </div>
    </div>
  );
}
