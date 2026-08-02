import React, { useEffect, useState, useId } from 'react';
import mermaid from 'mermaid';
import * as Icons from 'lucide-react';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
});

export interface MermaidDiagramProps {
  chart?: string;
  children?: React.ReactNode;
  className?: string;
}

export function MermaidDiagram({ chart, children, className = '' }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const rawId = useId();
  const chartCode = (chart || (typeof children === 'string' ? children : '') || '').trim();

  useEffect(() => {
    let isMounted = true;
    if (!chartCode) return;

    async function renderChart() {
      try {
        setError(null);
        // Clean up DOM id string for mermaid render
        const cleanId = `mermaid-id-${Math.random().toString(36).substring(2, 9)}`;
        const { svg: renderedSvg } = await mermaid.render(cleanId, chartCode);
        if (isMounted) {
          setSvg(renderedSvg);
        }
      } catch (err: any) {
        console.warn('Mermaid rendering error:', err);
        if (isMounted) {
          setError(err?.message || 'Invalid Mermaid diagram syntax');
        }
      }
    }

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chartCode]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chartCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!chartCode) return null;

  return (
    <div className={`my-6 rounded-2xl border border-slate-700/50 bg-slate-950/80 backdrop-blur-md overflow-hidden shadow-xl ${className}`}>
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 text-xs text-slate-400 font-mono">
        <span className="flex items-center gap-2 font-medium text-slate-300">
          <Icons.GitFork className="w-3.5 h-3.5 text-indigo-400" />
          <span>Mermaid Diagram</span>
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
          title="Copy Mermaid Code"
        >
          {copied ? (
            <>
              <Icons.Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Icons.Copy className="w-3.5 h-3.5" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>

      {/* Render Canvas */}
      <div className="p-6 overflow-x-auto custom-scrollbar flex justify-center items-center min-h-[120px]">
        {error ? (
          <div className="w-full p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-mono">
            <div className="flex items-center gap-2 font-semibold text-amber-400 mb-1">
              <Icons.AlertTriangle className="w-4 h-4" />
              <span>Mermaid Diagram Error</span>
            </div>
            <pre className="whitespace-pre-wrap text-[11px] text-amber-200/80 mt-2">{error}</pre>
            <details className="mt-3 text-[11px] cursor-pointer">
              <summary className="text-amber-400 hover:underline">View raw syntax</summary>
              <pre className="p-2 mt-1 rounded bg-slate-900 text-slate-300">{chartCode}</pre>
            </details>
          </div>
        ) : svg ? (
          <div
            className="mermaid-svg-container w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto [&>svg]:mx-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
            <Icons.Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
            <span>Rendering diagram...</span>
          </div>
        )}
      </div>
    </div>
  );
}
