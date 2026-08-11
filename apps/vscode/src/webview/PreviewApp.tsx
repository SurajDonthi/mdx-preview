import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MdxRenderer, createRendererRegistry } from '@mdxstudio/react';
import { mermaidPlugin } from '@mdxstudio/mermaid';
import { chartsPlugin } from '@mdxstudio/charts';
import { flowPlugin } from '@mdxstudio/flow';

import type { HostMessage, PreviewState } from '../shared/protocol';
import { collectAnchors, lineForOffset, offsetForLine, type Anchor } from './anchors';
import { DocumentBaseProvider, vscodeHostPlugin } from './documentBase';
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
  vscodeHostPlugin
);

/** Scroll reports are worth at most this often. */
const SCROLL_REPORT_INTERVAL_MS = 120;
/** How long after a programmatic scroll the resulting event is ignored. */
const PROGRAMMATIC_SCROLL_WINDOW_MS = 400;
/** How long a wheel, key or drag counts as "the reader is scrolling this". */
const USER_INPUT_WINDOW_MS = 700;

export function PreviewApp() {
  const [state, setState] = useState<PreviewState | null>(null);
  const [themeKind, setThemeKind] = useState(readThemeKind);
  const [generation, setGeneration] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorsRef = useRef<Anchor[]>([]);
  const anchorsStaleRef = useRef(true);
  const lastReportAt = useRef(0);
  const programmaticScrollUntil = useRef(0);
  const stateRef = useRef<PreviewState | null>(null);
  stateRef.current = state;

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
            programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
            window.scrollTo({ top: 0 });
          }
          return;
        }
        case 'revealLine': {
          const target = offsetForLine(anchors(), message.line);
          if (Math.abs(target - window.scrollY) < 4) return;
          programmaticScrollUntil.current = Date.now() + PROGRAMMATIC_SCROLL_WINDOW_MS;
          window.scrollTo({ top: target });
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
