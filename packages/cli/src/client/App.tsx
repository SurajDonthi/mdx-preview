import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, ListOrdered, Menu, PanelLeft } from 'lucide-react';

import { extractHeadings } from '@mdxstudio/core';
import type { MdxRegistry, ThemeId } from '@mdxstudio/core';
import { MdxRenderer, THEMES } from '@mdxstudio/react';

import { API_PREFIX } from '../protocol';
import type { BootData, ChangeEvent, DocEntry, DocResponse, TreeResponse } from '../protocol';
import { Sidebar } from './Sidebar';
import { Toc } from './Toc';
import { loadMdxConfig } from './config';
import { cliMdxRegistry, cliRegistryWith } from './registry';

const THEME_STORAGE_KEY = 'mdxstudio-cli.theme';

/** Below this the sidebar and outline are drawers rather than columns. */
const NARROW = 900;

function docHref(docPath: string): string {
  return `/${docPath.split('/').map(encodeURIComponent).join('/')}`;
}

function pathFromLocation(): string {
  try {
    return decodeURIComponent(window.location.pathname).replace(/^\/+/, '');
  } catch {
    return '';
  }
}

export function App({ boot }: { boot: BootData }) {
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [current, setCurrent] = useState(boot.path);
  const [content, setContent] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connected, setConnected] = useState(boot.watch);
  const [reloadedAt, setReloadedAt] = useState(0);

  // `null` until the folder's config file has been imported. Rendering the
  // built-in registry first and swapping it afterwards would parse every
  // document twice and flash components the config meant to replace.
  const [registry, setRegistry] = useState<MdxRegistry | null>(
    boot.configFile ? null : cliMdxRegistry
  );
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    if (!boot.configFile) return;

    let cancelled = false;
    void loadMdxConfig({
      file: boot.configFile,
      context: { React, createElement: React.createElement, components: cliMdxRegistry.components },
      build: cliRegistryWith,
    }).then((loaded) => {
      if (cancelled) return;
      // Either way the documents render: a broken config costs its components,
      // not the folder.
      if (loaded.error) console.error(`[mdxstudio] ${loaded.error}`);
      setConfigError(loaded.error);
      setRegistry(loaded.registry);
    });

    return () => {
      cancelled = true;
    };
  }, [boot.configFile]);

  const [themeId, setThemeId] = useState<ThemeId>(() => {
    // A remembered choice wins - except over `--theme`, which was typed just
    // now and would otherwise appear to do nothing.
    if (boot.themePinned && boot.theme in THEMES) return boot.theme as ThemeId;
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return (stored && stored in THEMES ? stored : boot.theme) as ThemeId;
  });

  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW);
  const [filesOpen, setFilesOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);

  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const currentRef = useRef(current);
  currentRef.current = current;

  const themeConfig = THEMES[themeId] ?? THEMES['github-dark'];

  useEffect(() => {
    const onResize = (): void => setNarrow(window.innerWidth < NARROW);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The shell chrome reads the same custom properties the renderer's stylesheet
  // declares, so the sidebar retheme comes for free with the document's.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-mdxstudio-theme', themeConfig.category);
    root.style.setProperty('--mdxcli-canvas', themeConfig.previewBg);
    root.style.setProperty('--mdxcli-canvas-fg', themeConfig.previewText);
    for (const [name, value] of Object.entries(themeConfig.cssVars ?? {})) {
      root.style.setProperty(name, value);
    }
    return () => {
      for (const name of Object.keys(themeConfig.cssVars ?? {})) root.style.removeProperty(name);
    };
  }, [themeConfig]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [themeId]);

  const loadTree = useCallback(async (): Promise<DocEntry[]> => {
    const response = await fetch(`${API_PREFIX}/api/tree`);
    if (!response.ok) throw new Error(`Could not list documents (${response.status})`);
    const tree = (await response.json()) as TreeResponse;
    setDocs(tree.docs);
    return tree.docs;
  }, []);

  const loadDoc = useCallback(async (docPath: string): Promise<void> => {
    const response = await fetch(`${API_PREFIX}/api/doc?path=${encodeURIComponent(docPath)}`);
    if (!response.ok) {
      setContent(null);
      setLoadError(`${docPath} could not be read - it may have been deleted or renamed.`);
      return;
    }
    const doc = (await response.json()) as DocResponse;
    setContent(doc.content);
    setLoadError(null);
  }, []);

  // First paint: list the folder, then open the requested document, or the
  // first one when the URL named none.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await loadTree();
        if (cancelled) return;
        const wanted = boot.path || list[0]?.path || '';
        if (!wanted) return;
        setCurrent(wanted);
        if (!boot.path && wanted) window.history.replaceState({}, '', docHref(wanted));
        await loadDoc(wanted);
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : String(cause));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boot.path, loadDoc, loadTree]);

  const navigate = useCallback(
    (docPath: string, push = true): void => {
      if (push) window.history.pushState({}, '', docHref(docPath));
      setCurrent(docPath);
      setContent(null);
      setFilesOpen(false);
      void loadDoc(docPath);
      scrollRoot?.scrollTo({ top: 0 });
    },
    [loadDoc, scrollRoot]
  );

  useEffect(() => {
    const onPopState = (): void => {
      const docPath = pathFromLocation();
      if (docPath) navigate(docPath, false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [navigate]);

  // Live reload. The server pushes which documents changed; only a change to
  // the one on screen re-reads a document, so browsing a big folder while a
  // generator writes into it stays quiet.
  useEffect(() => {
    if (!boot.watch) return;

    const stream = new EventSource(`${API_PREFIX}/events`);
    stream.onopen = () => setConnected(true);
    stream.onerror = () => setConnected(false);
    stream.onmessage = (message) => {
      let event: ChangeEvent;
      try {
        event = JSON.parse(message.data) as ChangeEvent;
      } catch {
        return;
      }
      if (event.tree) void loadTree();
      if (event.paths.includes(currentRef.current)) {
        void loadDoc(currentRef.current).then(() => setReloadedAt(Date.now()));
      }
    };

    return () => stream.close();
  }, [boot.watch, loadDoc, loadTree]);

  // Parsed with the same plugins the renderer uses, so the outline is built
  // from the tree that is on the page - and shares its parse.
  const headings = useMemo(
    () =>
      content
        ? extractHeadings(content, {
            remarkPlugins: registry?.remarkPlugins,
            rehypePlugins: registry?.rehypePlugins,
          })
        : [],
    [content, registry]
  );

  const scrollToHeading = useCallback((id: string): void => {
    const element = document.getElementById(id);
    if (element) element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const activeDoc = docs.find((doc) => doc.path === current);
  const showSidebar = !boot.single;

  useEffect(() => {
    document.title =
      !activeDoc || activeDoc.title === boot.label
        ? boot.label
        : `${activeDoc.title} - ${boot.label}`;
  }, [activeDoc, boot.label]);

  return (
    <div className="mdxcli-app">
      <header className="mdxcli-bar">
        {showSidebar && (
          <button
            type="button"
            className="mdxcli-iconbutton mdxcli-only-narrow"
            onClick={() => setFilesOpen(true)}
            aria-label="Open file list"
            data-testid="open-files"
          >
            <Menu className="mdxcli-icon" aria-hidden="true" />
          </button>
        )}

        <div className="mdxcli-bar__title">
          <PanelLeft className="mdxcli-icon mdxcli-bar__brand" aria-hidden="true" />
          <span className="mdxcli-bar__crumb" title={current || boot.label}>
            {activeDoc?.title ?? boot.label}
          </span>
          {current && <code className="mdxcli-bar__path">{current}</code>}
        </div>

        <div className="mdxcli-bar__spacer" />

        {boot.watch && (
          <span
            className={`mdxcli-live${connected ? ' is-live' : ''}`}
            title={connected ? 'Watching for file changes' : 'Not connected to the server'}
            data-testid="live-indicator"
            data-reloaded-at={reloadedAt}
          >
            <span className="mdxcli-live__dot" />
            {connected ? 'live' : 'offline'}
          </span>
        )}

        <label className="mdxcli-theme">
          <span className="mdxcli-visually-hidden">Theme</span>
          <select
            className="mdxcli-select"
            value={themeId}
            onChange={(event) => setThemeId(event.target.value as ThemeId)}
          >
            {Object.values(THEMES).map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="mdxcli-iconbutton mdxcli-only-narrow-toc"
          onClick={() => setOutlineOpen(true)}
          aria-label="Open outline"
        >
          <ListOrdered className="mdxcli-icon" aria-hidden="true" />
        </button>
      </header>

      <div className="mdxcli-body">
        {showSidebar && !narrow && (
          <aside className="mdxcli-sidebar" data-testid="sidebar">
            <Sidebar docs={docs} current={current} label={boot.label} onSelect={navigate} />
          </aside>
        )}

        {showSidebar && narrow && filesOpen && (
          <div className="mdxcli-drawer" data-testid="sidebar-drawer">
            <button
              type="button"
              className="mdxcli-drawer__scrim"
              aria-label="Close file list"
              onClick={() => setFilesOpen(false)}
            />
            <aside className="mdxcli-drawer__panel mdxcli-sidebar">
              <Sidebar
                docs={docs}
                current={current}
                label={boot.label}
                onSelect={navigate}
                onClose={() => setFilesOpen(false)}
              />
            </aside>
          </div>
        )}

        <main className="mdxcli-main" ref={setScrollRoot} data-testid="doc-scroll">
          {configError && (
            <div className="mdxcli-config-error" role="alert" data-testid="config-error">
              <AlertTriangle className="mdxcli-icon" aria-hidden="true" />
              <span>{configError}</span>
            </div>
          )}
          {loadError ? (
            <div className="mdxcli-empty" role="alert">
              <AlertTriangle className="mdxcli-empty__icon" aria-hidden="true" />
              <p>{loadError}</p>
            </div>
          ) : docs.length === 0 ? (
            <div className="mdxcli-empty">
              <FileText className="mdxcli-empty__icon" aria-hidden="true" />
              <p>
                No <code>.mdx</code> or <code>.md</code> files in <code>{boot.root}</code>.
              </p>
              <p className="mdxcli-empty__hint">
                Add one and it appears here - the folder is being watched.
              </p>
            </div>
          ) : content === null || registry === null ? (
            <div className="mdxcli-empty">
              <p>Loading {current}...</p>
            </div>
          ) : (
            <div className="mdxcli-doc" data-testid="doc">
              <MdxRenderer
                key={current}
                content={content}
                themeConfig={themeConfig}
                registry={registry}
                expressions={boot.expressions}
                containerId="mdxstudio-cli-document"
              />
            </div>
          )}
        </main>

        {!narrow && (
          <aside className="mdxcli-toc mdxcli-toc--rail" data-testid="toc">
            <Toc headings={headings} scrollRoot={scrollRoot} onSelect={scrollToHeading} />
          </aside>
        )}

        {narrow && outlineOpen && (
          <div className="mdxcli-drawer mdxcli-drawer--end" data-testid="toc-drawer">
            <button
              type="button"
              className="mdxcli-drawer__scrim"
              aria-label="Close outline"
              onClick={() => setOutlineOpen(false)}
            />
            <aside className="mdxcli-drawer__panel mdxcli-toc">
              <Toc
                headings={headings}
                scrollRoot={scrollRoot}
                onSelect={scrollToHeading}
                onClose={() => setOutlineOpen(false)}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
