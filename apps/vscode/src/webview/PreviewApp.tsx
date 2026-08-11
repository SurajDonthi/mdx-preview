import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdxRenderer, createRendererRegistry } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';
import { flowPlugin } from '@mdxstudio/flow';
import { tasksPlugin } from '@mdxstudio/tasks';

import type { HostMessage, PreviewState } from '../shared/protocol';
import { collectAnchors, lineForOffset, offsetForLine, type Anchor } from './anchors';
import { blockAt, markerRect, type BlockRect } from './blocks';
import { DocumentBaseProvider, vscodeHostPlugin } from './documentBase';
import { serialiseForExport } from './exportDom';
import { buildThemeConfig, observeThemeKind, readThemeKind } from './vscodeTheme';
import { post, rememberDocument } from './vscodeApi';

/**
 * Everything a previewed document may name. Module-level, because `MdxRenderer`
 * re-parses whenever the registry's identity changes - a registry rebuilt per
 * render would re-parse the document on every keystroke *and* on every scroll.
 *
 * `vscodeHostPlugin` comes last so its `img` and `a` replace the built-ins.
 */
const previewRegistry = createRendererRegistry(
  mermaidPlugin,
  chartsPlugin,
  flowPlugin,
  tasksPlugin,
  vscodeHostPlugin
);

/** Scroll reports are worth at most this often. */
const SCROLL_REPORT_INTERVAL_MS = 120;
/** How long after a programmatic scroll the resulting event is ignored. */
const PROGRAMMATIC_SCROLL_WINDOW_MS = 400;
/** How long a wheel, key or drag counts as "the reader is scrolling this". */
const USER_INPUT_WINDOW_MS = 700;
/**
 * How long to keep looking for a `#heading` that has been linked to. A document
 * with a Mermaid diagram above the target is not laid out on the first frame.
 */
const ANCHOR_RETRY_MS = 1200;

/** The element the webview bundle is mounted into. See `html.ts`. */
const ROOT_ID = 'mdxstudio-preview-root';

export function PreviewApp() {
  const [state, setState] = useState<PreviewState | null>(null);
  const [themeKind, setThemeKind] = useState(readThemeKind);
  const [generation, setGeneration] = useState(0);
  const [marker, setMarker] = useState<BlockRect | null>(null);
  const [zoom, setZoom] = useState(1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorsRef = useRef<Anchor[]>([]);
  const anchorsStaleRef = useRef(true);
  const lastReportAt = useRef(0);
  const programmaticScrollUntil = useRef(0);
  const stateRef = useRef<PreviewState | null>(null);
  stateRef.current = state;
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  const themeConfig = useMemo(() => buildThemeConfig(themeKind), [themeKind]);

  useEffect(() => observeThemeKind(setThemeKind), []);

  const anchors = useCallback((): Anchor[] => {
    const current = stateRef.current;
    const container = containerRef.current;
    if (!current || !container) return [];
    if (anchorsStaleRef.current) {
      anchorsRef.current = collectAnchors(current.content, container);
      anchorsStaleRef.current = false;
    }
    return anchorsRef.current;
  }, []);

  /* ---------------------------------------------------------------- *
   * Messages from the extension host
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const onMessage = (event: MessageEvent<HostMessage>) => {
      const message = event.data;
      if (!message || typeof message !== 'object') return;

      switch (message.type) {
        case 'render': {
          const previous = stateRef.current;
          setState(message.state);
          rememberDocument(message.state.uri);
          anchorsStaleRef.current = true;
          // A different document starts at the top; the same one keeps its
          // place, which is the whole point of not blowing the DOM away.
          if (!previous || previous.uri !== message.state.uri) {
            setMarker(null);
            if (!message.state.anchor) {
              programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
              window.scrollTo({ top: 0 });
            }
          }
          if (!message.state.highlightCurrentLine) setMarker(null);
          return;
        }
        case 'revealLine': {
          const target = offsetForLine(anchors(), message.line);
          if (Math.abs(target - window.scrollY) < 4) return;
          programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
          window.scrollTo({ top: target });
          return;
        }
        case 'highlightLine': {
          const current = stateRef.current;
          const container = containerRef.current;
          const root = document.getElementById(ROOT_ID);
          if (!current || !current.highlightCurrentLine || !container || !root) return;

          const block = blockAt(container, offsetForLine(anchors(), message.line));
          setMarker(block ? markerRect(block, root, zoomRef.current) : null);
          return;
        }
        case 'zoom': {
          setZoom(message.level);
          // The marker was measured at the old scale and is now in the wrong
          // place; the next cursor move puts it back.
          setMarker(null);
          anchorsStaleRef.current = true;
          return;
        }
        case 'export': {
          const container = containerRef.current;
          if (!container) return;
          post({ type: 'exported', payload: serialiseForExport(container) });
          return;
        }
        case 'refresh': {
          anchorsStaleRef.current = true;
          setGeneration((value) => value + 1);
          return;
        }
      }
    };

    window.addEventListener('message', onMessage);
    post({ type: 'ready' });
    return () => window.removeEventListener('message', onMessage);
  }, [anchors]);

  /* ---------------------------------------------------------------- *
   * Zoom
   *
   * Applied to the mount point rather than to anything React owns, so the
   * renderer's own tree is untouched. CSS `zoom` re-lays the document out
   * (unlike `transform: scale`), which keeps line lengths sensible and keeps
   * `getBoundingClientRect() + scrollY` a coordinate the scroll sync can still
   * use - the page's scroll extent grows with it.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.style.zoom = zoom === 1 ? '' : String(zoom);
    anchorsStaleRef.current = true;
  }, [zoom]);

  /* ---------------------------------------------------------------- *
   * Following a `./other.mdx#some-heading` link
   *
   * The host has already retargeted the preview by the time this runs; all
   * that is left is to find the heading. It may not be laid out yet - a Mermaid
   * diagram above it resolves a frame or two later and moves everything down -
   * so the position is taken again for a moment after it is first found.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const anchor = state?.anchor;
    if (!anchor) return;

    // A handful of attempts rather than a loop: scrolling on every frame for a
    // second would fight the reader if they moved in the meantime.
    const schedule = [0, 80, 250, 600, ANCHOR_RETRY_MS];
    const timers = schedule.map((delay) =>
      setTimeout(() => {
        const target = document.getElementById(anchor);
        if (!target) return;
        programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
        target.scrollIntoView({ block: 'start' });
      }, delay)
    );

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [state?.anchor, state?.revision]);

  /* ---------------------------------------------------------------- *
   * Reporting our own scroll position back to the editor
   *
   * Gated on the reader actually having scrolled *this* pane. A `scroll` event
   * is not evidence of that: the preview also scrolls when the editor tells it
   * to, and - the case that actually bites - when a Mermaid diagram or a flow
   * graph finishes laying out seconds after the paint and shifts everything
   * below it. Reporting either of those back moves the editor to a line the
   * reader never asked for, and the editor's own visible-range change then
   * moves the preview again. Requiring a wheel, a key or a held pointer breaks
   * that loop at the source rather than racing it with a timeout.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    let userInputUntil = 0;
    let pointerHeld = false;

    const stamp = () => {
      userInputUntil = Date.now() + USER_INPUT_WINDOW_MS;
    };
    const onPointerDown = () => {
      pointerHeld = true;
      stamp();
    };
    const onPointerUp = () => {
      pointerHeld = false;
      stamp();
    };

    const onScroll = () => {
      const current = stateRef.current;
      if (!current || !current.scrollEditorWithPreview) return;
      if (Date.now() < programmaticScrollUntil.current) return;
      if (!pointerHeld && Date.now() > userInputUntil) return;

      const now = Date.now();
      if (now - lastReportAt.current < SCROLL_REPORT_INTERVAL_MS) return;
      lastReportAt.current = now;

      post({
        type: 'scroll',
        line: lineForOffset(anchors(), window.scrollY),
        revision: current.revision,
      });
    };

    const options: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener('wheel', stamp, options);
    window.addEventListener('keydown', stamp, options);
    window.addEventListener('touchmove', stamp, options);
    window.addEventListener('pointerdown', onPointerDown, options);
    window.addEventListener('pointerup', onPointerUp, options);
    window.addEventListener('pointercancel', onPointerUp, options);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('wheel', stamp, options);
      window.removeEventListener('keydown', stamp, options);
      window.removeEventListener('touchmove', stamp, options);
      window.removeEventListener('pointerdown', onPointerDown, options);
      window.removeEventListener('pointerup', onPointerUp, options);
      window.removeEventListener('pointercancel', onPointerUp, options);
      window.removeEventListener('scroll', onScroll);
    };
  }, [anchors]);

  /* ---------------------------------------------------------------- *
   * Ctrl/Cmd+click -> the source line that block came from
   *
   * Capture phase, so it wins over the link handler in `documentBase.tsx`:
   * ctrl-clicking a link means "show me where this is written", not "follow it".
   * The click's own y is the only input needed - it goes through the same anchor
   * map the scroll sync uses.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.button !== 0) return;

      const current = stateRef.current;
      const container = containerRef.current;
      if (!current || !container) return;
      if (!(event.target instanceof Node) || !container.contains(event.target)) return;

      event.preventDefault();
      event.stopPropagation();

      post({
        type: 'revealSource',
        line: lineForOffset(anchors(), event.clientY + window.scrollY),
        revision: current.revision,
      });
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [anchors]);

  /* ---------------------------------------------------------------- *
   * Keeping the anchor map honest
   *
   * Mermaid resolves after the first paint and the flow graph measures itself,
   * so the offsets collected during the render are wrong within a frame or two
   * of every document that contains one. Rather than guess at a delay, the
   * anchors are marked stale whenever anything changes size and recomputed the
   * next time somebody asks for them.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const invalidate = () => {
      anchorsStaleRef.current = true;
    };

    const resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(container);

    const mutationObserver = new MutationObserver(invalidate);
    mutationObserver.observe(container, { childList: true, subtree: true });

    window.addEventListener('resize', invalidate);
    window.addEventListener('load', invalidate);

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('load', invalidate);
    };
  }, [state?.uri]);

  useEffect(() => {
    anchorsStaleRef.current = true;
  }, [state?.content, themeKind]);

  if (!state) {
    return (
      <div className="mdxstudio-vscode-empty">
        <p>Open an .mdx file to preview it.</p>
      </div>
    );
  }

  return (
    <DocumentBaseProvider
      value={{ baseUri: state.baseUri, workspaceUri: state.workspaceUri }}
    >
      {state.restriction && (
        <div className="mdxstudio-vscode-restricted" role="status">
          <span className="mdxstudio-vscode-restricted__dot" aria-hidden="true" />
          {state.restriction}
        </div>
      )}
      {marker && (
        <div
          className="mdxstudio-vscode-current-line"
          style={{ top: `${marker.top}px`, height: `${marker.height}px` }}
          aria-hidden="true"
        />
      )}
      <MdxRenderer
        key={`${state.uri}#${generation}`}
        content={state.content}
        themeConfig={themeConfig}
        registry={previewRegistry}
        expressions={state.expressions}
        showFrontmatterHeader={state.showFrontmatterHeader}
        containerId="mdxstudio-vscode-preview"
        containerRef={containerRef}
      />
    </DocumentBaseProvider>
  );
}
