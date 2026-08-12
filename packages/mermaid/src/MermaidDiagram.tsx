import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, GitFork, Loader2, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { MdxRenderContext } from '@mdxstudio/core';
import type { MdxRenderMode, MdxThemeCategory } from '@mdxstudio/core';
import {
  MERMAID_FIT,
  MERMAID_KEY_PAN_STEP,
  clampScale,
  clampTransform,
  isPannable,
  panBy,
  pinchScale,
  pointerDistance,
  pointerMidpoint,
  transformToCss,
  zoomAbout,
  zoomByStep,
  zoomPercent,
} from './panZoom';
import type { MermaidTransform, MermaidViewportSize } from './panZoom';

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

interface MermaidPanZoom {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  transform: MermaidTransform;
  dragging: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
  onPointerMove: React.PointerEventHandler<HTMLDivElement>;
  onPointerEnd: React.PointerEventHandler<HTMLDivElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
}

/**
 * Wires the arithmetic in `panZoom.ts` to a real element.
 *
 * `enabled` is false whenever there is no drawing to explore — an export, a
 * parse failure, a diagram still rendering — and every listener then costs
 * nothing. `resetKey` changes when the drawing itself does, which puts the
 * reader back at the fit rather than leaving them zoomed into a picture that is
 * no longer there.
 */
function useMermaidPanZoom(enabled: boolean, resetKey: string): MermaidPanZoom {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<MermaidTransform>(MERMAID_FIT);
  const [dragging, setDragging] = useState(false);
  /** Client-space position of every pointer currently down on the viewport. */
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ pointerId: number; x: number; y: number; from: MermaidTransform } | null>(
    null
  );
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  // Event handlers run after commit, so a mirror updated during render always
  // holds the transform the reader can see.
  const transformRef = useRef(transform);
  transformRef.current = transform;

  const measure = useCallback((): MermaidViewportSize => {
    const element = viewportRef.current;
    if (!element) return { width: 0, height: 0 };
    return { width: element.clientWidth, height: element.clientHeight };
  }, []);

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const element = viewportRef.current;
    if (!element || typeof element.getBoundingClientRect !== 'function') return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  useEffect(() => {
    setTransform(MERMAID_FIT);
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    setDragging(false);
  }, [resetKey]);

  // A Split pane dragged narrower shrinks the frame under a panned diagram; the
  // offset has to be pulled back inside the new bounds or the drawing hangs off
  // an edge with no way to fetch it.
  useEffect(() => {
    const element = viewportRef.current;
    if (!enabled || !element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      setTransform((current) =>
        clampTransform(current, { width: element.clientWidth, height: element.clientHeight })
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!enabled || !element) return;
    const onWheel = (event: WheelEvent) => {
      // A plain wheel belongs to the page. Only the Ctrl/Cmd chord every map and
      // canvas already uses zooms the diagram, and only then is the browser's own
      // page zoom suppressed.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const focus = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const viewport = { width: element.clientWidth, height: element.clientHeight };
      setTransform((current) =>
        // Exponential rather than additive, so a trackpad's stream of small
        // deltas and a mouse wheel's single notch feel like the same gesture.
        zoomAbout(current, clampScale(current.scale * Math.exp(-event.deltaY / 320)), focus, viewport)
      );
    };
    // React registers wheel listeners passively at the root, where
    // `preventDefault` does nothing, so the chord has to be bound directly.
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [enabled]);

  const zoomIn = useCallback(() => {
    setTransform((current) => zoomByStep(current, 1, measure()));
  }, [measure]);

  const zoomOut = useCallback(() => {
    setTransform((current) => zoomByStep(current, -1, measure()));
  }, [measure]);

  const reset = useCallback(() => setTransform(MERMAID_FIT), []);

  const beginDrag = useCallback((pointerId: number, x: number, y: number) => {
    dragRef.current = { pointerId, x, y, from: transformRef.current };
    setDragging(true);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const pointers = pointersRef.current;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.size === 2) {
        const [a, b] = Array.from(pointers.values());
        dragRef.current = null;
        setDragging(false);
        pinchRef.current = {
          distance: pointerDistance(a, b),
          scale: clampScale(transformRef.current.scale),
        };
        return;
      }
      if (pointers.size !== 1) return;
      // Nothing sits outside the frame at the fitted scale, so a press there is
      // left alone: text stays selectable and the cursor stays an arrow.
      if (!isPannable(transformRef.current)) return;

      beginDrag(event.pointerId, event.clientX, event.clientY);
      const element = viewportRef.current;
      if (element && typeof element.setPointerCapture === 'function') {
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // A pointer the browser has already released cannot be captured. The
          // drag still works, it just ends when the pointer leaves the element.
        }
      }
    },
    [beginDrag, enabled]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const pointers = pointersRef.current;
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const viewport = measure();

      const pinch = pinchRef.current;
      if (pinch && pointers.size >= 2) {
        const [a, b] = Array.from(pointers.values());
        const next = pinchScale(pinch.scale, pinch.distance, pointerDistance(a, b));
        const middle = pointerMidpoint(a, b);
        const focus = toLocal(middle.x, middle.y);
        setTransform((current) => zoomAbout(current, next, focus, viewport));
        return;
      }

      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      // Measured from where the drag started rather than accumulated, so running
      // into a clamped edge does not eat the journey back.
      setTransform(() => panBy(drag.from, event.clientX - drag.x, event.clientY - drag.y, viewport));
    },
    [enabled, measure, toLocal]
  );

  const onPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const pointers = pointersRef.current;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchRef.current = null;

      const drag = dragRef.current;
      if (drag && drag.pointerId === event.pointerId) {
        dragRef.current = null;
        setDragging(false);
      }

      const element = viewportRef.current;
      if (
        element &&
        typeof element.hasPointerCapture === 'function' &&
        typeof element.releasePointerCapture === 'function' &&
        element.hasPointerCapture(event.pointerId)
      ) {
        element.releasePointerCapture(event.pointerId);
      }

      // Lifting one finger out of a pinch hands the other one the drag, so the
      // gesture does not dead-end while a finger is still on the glass.
      if (enabled && pointers.size === 1 && !dragRef.current && isPannable(transformRef.current)) {
        const [remainingId] = Array.from(pointers.keys());
        const point = pointers.get(remainingId);
        if (point) beginDrag(remainingId, point.x, point.y);
      }
    },
    [beginDrag, enabled]
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!enabled) return;
      const viewport = measure();
      const step = event.shiftKey ? MERMAID_KEY_PAN_STEP * 3 : MERMAID_KEY_PAN_STEP;
      const pan = (dx: number, dy: number) => {
        // With nothing to pan the arrow keys belong to the page, so a diagram
        // nobody has zoomed never swallows the reader's keystrokes.
        if (!isPannable(transformRef.current)) return;
        event.preventDefault();
        setTransform((current) => panBy(current, dx, dy, viewport));
      };

      switch (event.key) {
        case 'ArrowLeft':
          pan(step, 0);
          break;
        case 'ArrowRight':
          pan(-step, 0);
          break;
        case 'ArrowUp':
          pan(0, step);
          break;
        case 'ArrowDown':
          pan(0, -step);
          break;
        case '+':
        case '=':
          event.preventDefault();
          zoomIn();
          break;
        case '-':
        case '_':
          event.preventDefault();
          zoomOut();
          break;
        case '0':
          event.preventDefault();
          reset();
          break;
        default:
          break;
      }
    },
    [enabled, measure, reset, zoomIn, zoomOut]
  );

  return {
    viewportRef,
    transform,
    dragging,
    zoomIn,
    zoomOut,
    reset,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onKeyDown,
  };
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
  const canExplore = !isPdf && renderState === 'ready' && Boolean(svg) && !error;
  const panZoom = useMermaidPanZoom(
    canExplore,
    `${effectiveRenderMode}|${effectiveThemeCategory}|${chartCode}`
  );
  const pannable = isPannable(panZoom.transform);

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
      data-mermaid-zoom={canExplore ? zoomPercent(panZoom.transform) : undefined}
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
        ) : svg && isPdf ? (
          /* The export sheet gets the drawing at its natural fit and nothing
             else. Every button is stripped from the capture anyway, and a
             diagram frozen mid-zoom would arrive cropped. */
          <div
            className="mermaid-svg-container"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : svg ? (
          <div
            ref={panZoom.viewportRef}
            role="group"
            aria-label="Mermaid diagram, pannable and zoomable"
            aria-describedby={`${stableMermaidId}-help`}
            tabIndex={0}
            data-mermaid-viewport="true"
            className={
              'mdxstudio-mermaid__viewport' +
              (pannable ? ' mdxstudio-mermaid__viewport--pannable' : '') +
              (panZoom.dragging ? ' mdxstudio-mermaid__viewport--dragging' : '')
            }
            onPointerDown={panZoom.onPointerDown}
            onPointerMove={panZoom.onPointerMove}
            onPointerUp={panZoom.onPointerEnd}
            onPointerCancel={panZoom.onPointerEnd}
            onKeyDown={panZoom.onKeyDown}
          >
            <div
              className="mdxstudio-mermaid__stage"
              style={{ transform: transformToCss(panZoom.transform) }}
            >
              <div
                className="mermaid-svg-container"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>

            <p id={`${stableMermaidId}-help`} className="mdxstudio-mermaid__sr-only">
              Drag or press the arrow keys to pan. Plus and minus zoom, zero returns to the
              fitted view. Hold Control or Command while scrolling to zoom; scrolling on its
              own moves the page.
            </p>

            {/* The cluster sits inside the frame, so a press on it must not also
                read as the start of a drag. */}
            <div
              className="mdxstudio-mermaid__controls"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                onClick={panZoom.zoomOut}
                aria-label="Zoom out"
                title="Zoom out"
                className="mdxstudio-mermaid__control"
              >
                <ZoomOut className="mdxstudio-mermaid__icon-14" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={panZoom.zoomIn}
                aria-label="Zoom in"
                title="Zoom in"
                className="mdxstudio-mermaid__control"
              >
                <ZoomIn className="mdxstudio-mermaid__icon-14" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={panZoom.reset}
                aria-label="Reset zoom"
                title="Reset zoom"
                className="mdxstudio-mermaid__control"
              >
                <RotateCcw className="mdxstudio-mermaid__icon-14" aria-hidden="true" />
              </button>
            </div>
          </div>
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
