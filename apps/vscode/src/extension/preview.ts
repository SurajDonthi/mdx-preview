import * as path from 'node:path';

import * as vscode from 'vscode';

import type {
  ExportPayload,
  HostMessage,
  PreviewState,
  WebviewMessage,
} from '../shared/protocol';
import { configLocations, type ConfigLocation } from './config';
import { buildExportDocument } from './exportHtml';
import { buildPreviewHtml } from './html';
import { isExternalLink, isMarkdownPath, resolveLinkPath, splitFragment } from './links';
import { restrictionMessage, type ConfigPolicy } from './policy';
import { affectsPreviewDocument, readSettings } from './settings';

export const PREVIEW_VIEW_TYPE = 'mdxstudio.preview';

/** How long after one side scrolls the other side's echo is ignored. */
const SCROLL_ECHO_WINDOW_MS = 400;

/** How long to wait for the webview to serialise itself before giving up. */
const EXPORT_TIMEOUT_MS = 15_000;

/** The furthest the preview zoom will go in either direction. */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

/**
 * An `.mdx` file - the only kind auto-preview will volunteer itself for.
 *
 * Markdown is deliberately excluded here: VS Code's own preview owns `.md`, and
 * a second panel appearing on every readme would be hostile. `.md` reaches this
 * renderer from the title bar button and the command palette instead.
 */
export function isMdxDocument(document: vscode.TextDocument | undefined): boolean {
  if (!document) return false;
  if (document.languageId === 'mdx') return true;
  return document.uri.path.toLowerCase().endsWith('.mdx');
}

/**
 * Anything this renderer can show, which includes plain Markdown: the parser
 * runs `remark-parse` + `remark-gfm` before it ever looks for MDX nodes, so a
 * `.md` file is just an MDX document that happens to contain no JSX.
 *
 * Used for the commands and for retargeting a preview that is already open,
 * never for deciding whether to open one unasked.
 */
export function isPreviewableDocument(document: vscode.TextDocument | undefined): boolean {
  if (!document) return false;
  if (isMdxDocument(document)) return true;
  if (document.languageId === 'markdown') return true;
  return /\.(md|markdown|mdown|mkd)$/i.test(document.uri.path);
}

/**
 * One preview panel.
 *
 * Like the built-in Markdown preview, a panel is *dynamic*: it follows whichever
 * `.mdx` editor is active rather than being pinned to the document it was opened
 * from. Switching to a non-MDX editor leaves the last document on screen.
 */
export class MdxPreview {
  private readonly disposables: vscode.Disposable[] = [];
  private document: vscode.TextDocument;
  private revision = 0;
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private webviewReady = false;
  /** Set while the webview has not acknowledged the first render. */
  private pendingState: PreviewState | null = null;
  private lastEditorScrollAt = 0;
  private lastPreviewScrollAt = 0;
  private disposed = false;
  /** Scale factor for the rendered document. Panel-local; `1` is unscaled. */
  private zoomLevel = 1;
  /**
   * A heading id to scroll to on the next render, from a `file.mdx#anchor`
   * link. Consumed by whichever `buildState()` runs first.
   */
  private pendingAnchor: string | null = null;
  /** Bumped on every `reload()`, so a changed stylesheet is re-fetched. */
  private documentGeneration = 0;
  /** The line the marker is already on, so a keystroke on it costs nothing. */
  private lastHighlightedLine = -1;
  /** The custom stylesheet in force, so the watcher is only rebuilt when it moves. */
  private customCssUri: vscode.Uri | null = null;
  private customCssWatcher: vscode.FileSystemWatcher | null = null;
  /** The last unusable `mdxstudio.customCss` complained about, to complain once. */
  private reportedBadCustomCss: string | null = null;
  /** The config file this document was built around, found or not loaded. */
  private configUri: vscode.Uri | null = null;
  /** Whether that file is actually being imported - trust has a say. */
  private configLoads = false;
  private configWatcher: vscode.FileSystemWatcher | null = null;
  /** The pattern the watcher was built for, so it is only rebuilt when it moves. */
  private configWatchKey: string | null = null;
  /** The last unusable `mdxstudio.config` complained about, to complain once. */
  private reportedBadConfig: string | null = null;
  private pendingExport: ((payload: ExportPayload | null) => void) | null = null;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    document: vscode.TextDocument,
    private readonly onDisposed: (preview: MdxPreview) => void
  ) {
    this.document = document;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => this.handleMessage(message),
      null,
      this.disposables
    );
    this.panel.onDidChangeViewState(
      () => {
        void vscode.commands.executeCommand(
          'setContext',
          'mdxstudio.previewFocus',
          this.panel.active
        );
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      (event) => {
        if (event.document.uri.toString() !== this.document.uri.toString()) return;
        if (event.contentChanges.length === 0) return;
        this.document = event.document;
        // `onSave` and `manual` still track the document object; what they skip
        // is the re-render, not the bookkeeping.
        if (readSettings(this.document.uri).updateMode !== 'onType') return;
        this.scheduleUpdate();
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidSaveTextDocument(
      (saved) => {
        if (saved.uri.toString() !== this.document.uri.toString()) return;
        if (readSettings(this.document.uri).updateMode !== 'onSave') return;
        this.document = saved;
        this.scheduleUpdate(true);
      },
      null,
      this.disposables
    );

    // The source file being reopened (or renamed onto) gives us a live document
    // again after it was closed.
    vscode.workspace.onDidOpenTextDocument(
      (opened) => {
        if (opened.uri.toString() === this.document.uri.toString()) {
          this.document = opened;
        }
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeConfiguration(
      (event) => {
        if (!event.affectsConfiguration('mdxstudio', this.document.uri)) return;
        if (affectsPreviewDocument(event, this.document.uri)) {
          // The expression mode decides whether the CSP grants 'unsafe-eval',
          // and a custom stylesheet is a `<link>` in the same head. Neither can
          // be changed after the document has loaded.
          this.reload();
          return;
        }
        this.scheduleUpdate(true);
      },
      null,
      this.disposables
    );

    // Granting trust promotes the preview from `literals` to whatever the
    // setting asks for - which changes the CSP, so nothing short of rebuilding
    // the whole document will do it.
    vscode.workspace.onDidGrantWorkspaceTrust(() => this.reload(), null, this.disposables);

    vscode.window.onDidChangeTextEditorVisibleRanges(
      (event) => this.syncPreviewToEditor(event),
      null,
      this.disposables
    );

    vscode.window.onDidChangeTextEditorSelection(
      (event) => this.highlightCursor(event),
      null,
      this.disposables
    );

    this.reload();
  }

  static create(
    document: vscode.TextDocument,
    column: vscode.ViewColumn,
    extensionUri: vscode.Uri,
    onDisposed: (preview: MdxPreview) => void
  ): MdxPreview {
    const panel = vscode.window.createWebviewPanel(
      PREVIEW_VIEW_TYPE,
      previewTitle(document.uri),
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        // Keeps the rendered DOM - and every Mermaid diagram that has already
        // been laid out - alive while the tab is in the background, so coming
        // back to it is instant and lands on the same scroll position.
        retainContextWhenHidden: true,
        localResourceRoots: localRootsFor(document.uri, extensionUri),
      }
    );
    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'media', 'preview-icon.svg');
    return new MdxPreview(panel, extensionUri, document, onDisposed);
  }

  static restore(
    panel: vscode.WebviewPanel,
    document: vscode.TextDocument,
    extensionUri: vscode.Uri,
    onDisposed: (preview: MdxPreview) => void
  ): MdxPreview {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: localRootsFor(document.uri, extensionUri),
    };
    return new MdxPreview(panel, extensionUri, document, onDisposed);
  }

  get viewColumn(): vscode.ViewColumn | undefined {
    return this.panel.viewColumn;
  }

  get documentUri(): vscode.Uri {
    return this.document.uri;
  }

  get isActive(): boolean {
    return !this.disposed && this.panel.active;
  }

  reveal(column?: vscode.ViewColumn): void {
    if (this.disposed) return;
    // `preserveFocus` throughout: bringing the preview forward must never take
    // the cursor out of the editor.
    this.panel.reveal(column ?? this.panel.viewColumn, true);
  }

  /** Points the preview at another document, as the Markdown preview does. */
  follow(document: vscode.TextDocument): void {
    if (this.disposed) return;
    if (document.uri.toString() === this.document.uri.toString()) return;

    this.document = document;
    this.panel.title = previewTitle(document.uri);
    this.reload();
  }

  refresh(): void {
    this.post({ type: 'refresh' });
    this.scheduleUpdate(true);
  }

  /** `MDX Studio: Zoom In` and friends. `delta` of 0 resets. */
  zoom(delta: number): void {
    const next = delta === 0 ? 1 : this.zoomLevel + delta;
    const clamped = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) * 100) / 100;
    if (clamped === this.zoomLevel) return;
    this.zoomLevel = clamped;
    this.post({ type: 'zoom', level: clamped });
  }

  /** Rebuilds the whole document, which is the only way to change its CSP. */
  private reload(): void {
    void this.rebuild();
  }

  /**
   * The rebuild itself, which has to look at the disk before it can write the
   * page: whether a config file is there decides whether `script-src` names the
   * webview's own origin, and a document's policy is fixed once it has loaded.
   *
   * `documentGeneration` doubles as the race guard. Two reloads in flight - a
   * keystroke in the settings file while a watcher fires, say - would otherwise
   * be free to finish in either order and leave the page describing the older
   * of the two.
   */
  private async rebuild(): Promise<void> {
    const generation = (this.documentGeneration += 1);
    const settings = readSettings(this.document.uri);
    const configUri = await this.findConfig(settings.config);
    if (this.disposed || this.documentGeneration !== generation) return;

    const customCssUri = this.resolveCustomCss(settings.customCss);
    this.configUri = configUri;
    this.configLoads = settings.config.enabled && configUri !== null;

    // The stylesheet's folder has to be a resource root before the webview will
    // read it, and the document may have moved since the panel was created. So
    // does the config's, for the same reason and with more at stake.
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: localRootsFor(
        this.document.uri,
        this.extensionUri,
        customCssUri,
        this.configLoads ? configUri : null
      ),
    };
    this.watchCustomCss(customCssUri);
    this.watchConfig(settings.config);

    this.webviewReady = false;
    this.lastHighlightedLine = -1;
    this.pendingState = this.buildState();

    this.panel.webview.html = buildPreviewHtml({
      webview: this.panel.webview,
      extensionUri: this.extensionUri,
      expressions: settings.expressions,
      title: previewTitle(this.document.uri),
      customCssUri,
      loadsConfig: this.configLoads,
      cacheBust: generation,
    });
  }

  private scheduleUpdate(immediate = false): void {
    if (this.disposed) return;
    if (this.updateTimer) clearTimeout(this.updateTimer);

    const delay = immediate ? 0 : readSettings(this.document.uri).delay;
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.sendState();
    }, delay);
  }

  private buildState(): PreviewState {
    const settings = readSettings(this.document.uri);
    const uri = this.document.uri;
    const directory = uri.with({ path: uri.path.replace(/\/[^/]*$/, '') });
    const folder = vscode.workspace.getWorkspaceFolder(uri);

    this.revision += 1;

    const anchor = this.pendingAnchor;
    this.pendingAnchor = null;

    const configFile = this.configUri ? basename(this.configUri) : null;

    return {
      uri: uri.toString(),
      fileName: basename(uri),
      content: safeText(this.document),
      collapsibleHeadings: settings.collapsibleHeadings,
      baseUri: `${this.panel.webview.asWebviewUri(directory).toString()}/`,
      workspaceUri: folder
        ? `${this.panel.webview.asWebviewUri(folder.uri).toString()}/`
        : null,
      expressions: settings.expressions,
      restriction: restrictionMessage({
        expressions: settings.restricted,
        // Only a config that is actually sitting there is worth a banner: a
        // workspace that has none is not having anything withheld from it.
        configFile: settings.config.restricted ? configFile : null,
      }),
      // The generation the page was built with, so a config edited on disk is
      // re-imported rather than served out of the webview's module cache.
      configUri:
        this.configLoads && this.configUri
          ? `${this.panel.webview.asWebviewUri(this.configUri).toString()}?v=${this.documentGeneration}`
          : null,
      configFile: this.configLoads ? configFile : null,
      showFrontmatterHeader: settings.showFrontmatterHeader,
      scrollEditorWithPreview: settings.scrollEditorWithPreview,
      highlightCurrentLine: settings.highlightCurrentLine,
      anchor,
      revision: this.revision,
    };
  }

  private sendState(): void {
    const state = this.buildState();
    if (!this.webviewReady) {
      this.pendingState = state;
      return;
    }
    this.post({ type: 'render', state });
  }

  private post(message: HostMessage): void {
    if (this.disposed) return;
    void this.panel.webview.postMessage(message);
  }

  private handleMessage(message: WebviewMessage): void {
    switch (message.type) {
      case 'ready': {
        this.webviewReady = true;
        const state = this.pendingState ?? this.buildState();
        this.pendingState = null;
        this.post({ type: 'render', state });
        // The page was rebuilt from scratch, so the zoom it was showing at went
        // with it. Panel-local state, restored rather than reset.
        if (this.zoomLevel !== 1) this.post({ type: 'zoom', level: this.zoomLevel });
        return;
      }
      case 'scroll':
        this.syncEditorToPreview(message.line, message.revision);
        return;
      case 'revealSource':
        void this.revealSource(message.line, message.revision);
        return;
      case 'openLink':
        void this.openLink(message.href);
        return;
      case 'exported': {
        const resolve = this.pendingExport;
        this.pendingExport = null;
        resolve?.(message.payload);
        return;
      }
      case 'error':
        console.error(`[mdxstudio] preview: ${message.message}`);
        return;
    }
  }

  /* ---------------------------------------------------------------- *
   * Scroll sync
   * ---------------------------------------------------------------- */

  /** Editor scrolled -> move the preview, unless the preview caused it. */
  private syncPreviewToEditor(event: vscode.TextEditorVisibleRangesChangeEvent): void {
    if (event.textEditor.document.uri.toString() !== this.document.uri.toString()) return;
    if (!readSettings(this.document.uri).scrollPreviewWithEditor) return;
    if (Date.now() - this.lastPreviewScrollAt < SCROLL_ECHO_WINDOW_MS) return;

    const range = event.visibleRanges[0];
    if (!range) return;

    this.lastEditorScrollAt = Date.now();
    this.post({ type: 'revealLine', line: range.start.line + 1 });
  }

  /** Preview scrolled -> move the editor, unless the editor caused it. */
  private syncEditorToPreview(line: number, revision: number): void {
    if (revision !== this.revision) return;
    if (!readSettings(this.document.uri).scrollEditorWithPreview) return;
    if (Date.now() - this.lastEditorScrollAt < SCROLL_ECHO_WINDOW_MS) return;

    const editor = vscode.window.visibleTextEditors.find(
      (candidate) => candidate.document.uri.toString() === this.document.uri.toString()
    );
    if (!editor) return;

    const target = Math.max(0, Math.min(editor.document.lineCount - 1, Math.round(line) - 1));
    this.lastPreviewScrollAt = Date.now();
    editor.revealRange(
      new vscode.Range(target, 0, target, 0),
      vscode.TextEditorRevealType.AtTop
    );
  }

  /**
   * Cursor moved -> mark the block it belongs to in the preview.
   *
   * This fires on every keystroke, and answering it makes the webview measure
   * every top-level block in the document. Typing along a line does not change
   * which line the cursor is on, so most of those are dropped here rather than
   * paid for over there.
   */
  private highlightCursor(event: vscode.TextEditorSelectionChangeEvent): void {
    if (event.textEditor.document.uri.toString() !== this.document.uri.toString()) return;
    if (!readSettings(this.document.uri).highlightCurrentLine) return;

    const active = event.selections[0]?.active;
    if (!active) return;

    const line = active.line + 1;
    if (line === this.lastHighlightedLine) return;
    this.lastHighlightedLine = line;
    this.post({ type: 'highlightLine', line });
  }

  /**
   * Ctrl/Cmd+click in the preview -> put the cursor on the line that block came
   * from, opening the document if it is not on screen.
   */
  private async revealSource(line: number, revision: number): Promise<void> {
    if (revision !== this.revision) return;

    let editor = vscode.window.visibleTextEditors.find(
      (candidate) => candidate.document.uri.toString() === this.document.uri.toString()
    );
    if (!editor) {
      try {
        const document = await vscode.workspace.openTextDocument(this.document.uri);
        editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false,
        });
      } catch {
        return;
      }
    }

    const target = Math.max(0, Math.min(editor.document.lineCount - 1, Math.round(line) - 1));
    const at = new vscode.Range(target, 0, target, 0);

    // Suppresses the scroll-sync echo: revealing the range moves the editor's
    // visible range, which would otherwise be read as "the editor scrolled".
    this.lastPreviewScrollAt = Date.now();
    editor.selection = new vscode.Selection(target, 0, target, 0);
    editor.revealRange(at, vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    // The reader asked to be taken there, so this one *does* move focus - it is
    // the only interaction in the preview that is allowed to.
    await vscode.window.showTextDocument(editor.document, {
      viewColumn: editor.viewColumn,
      preserveFocus: false,
      selection: at,
    });
  }

  /* ---------------------------------------------------------------- *
   * Links
   * ---------------------------------------------------------------- */

  /**
   * A relative link in the document.
   *
   * Another `.md`/`.mdx` file is followed *in the preview* - resolved against
   * this document's folder, opened in an editor the way every other document
   * this extension opens is, and scrolled to the `#anchor` if the link had one.
   * Anything else is handed to VS Code. Nothing that fails here is allowed to
   * take the webview down with it: a link to a file that is not there says so
   * and leaves the preview alone.
   */
  private async openLink(href: string): Promise<void> {
    const { path: linkPath, fragment } = splitFragment(href);

    // A bare `#anchor` never reaches here - the webview scrolls to those itself
    // - so an empty path means `#anchor` written as `./this.mdx#anchor`.
    if (linkPath === '') {
      this.pendingAnchor = fragment || null;
      this.sendState();
      return;
    }

    if (isExternalLink(linkPath)) {
      await vscode.env.openExternal(vscode.Uri.parse(href));
      return;
    }

    const base = this.document.uri;
    const folder = vscode.workspace.getWorkspaceFolder(base);
    const resolved = resolveLinkPath(linkPath, base.path, folder ? folder.uri.path : null);
    if (resolved === null) return;

    const target = base.with({ path: resolved, query: '', fragment: '' });

    let stat: vscode.FileStat;
    try {
      stat = await vscode.workspace.fs.stat(target);
    } catch {
      void vscode.window.showWarningMessage(
        `MDX Studio: "${href}" does not exist next to ${basename(base)}.`
      );
      return;
    }

    if (stat.type === vscode.FileType.Directory) {
      void vscode.window.showWarningMessage(`MDX Studio: "${href}" is a folder.`);
      return;
    }

    if (!isMarkdownPath(resolved)) {
      // An image, a source file, a PDF: VS Code knows what to do with it and
      // this renderer does not.
      await vscode.commands.executeCommand('vscode.open', target).then(undefined, () => {
        void vscode.window.showWarningMessage(`MDX Studio: could not open "${href}".`);
      });
      return;
    }

    // Set before the editor is shown: showing it makes the active editor change,
    // which retargets this very preview, and the state that render builds is
    // where the anchor has to be.
    this.pendingAnchor = fragment || null;

    try {
      const document = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      });
      // A no-op if the active-editor change already retargeted us; the point is
      // that the preview follows the link even when it did not.
      this.follow(document);
      if (this.document.uri.toString() === target.toString() && this.pendingAnchor) {
        // Same document as before the click, so nothing reloaded and nothing has
        // consumed the anchor. Re-send so the webview scrolls to it.
        this.sendState();
      }
    } catch {
      this.pendingAnchor = null;
      void vscode.window.showWarningMessage(`MDX Studio: could not open "${href}".`);
    }
  }

  /* ---------------------------------------------------------------- *
   * Custom stylesheet
   * ---------------------------------------------------------------- */

  /**
   * `mdxstudio.customCss` as a `Uri`, or null.
   *
   * Relative paths are workspace-relative, which is what makes the setting
   * committable: `.vscode/mdx.css` means the same thing on every machine. A
   * path that is not there is reported once - re-reporting on every keystroke
   * would make the setting unusable while it is being typed.
   */
  private resolveCustomCss(setting: string): vscode.Uri | null {
    if (!setting) {
      this.reportedBadCustomCss = null;
      return null;
    }

    const folder = vscode.workspace.getWorkspaceFolder(this.document.uri)
      ?? vscode.workspace.workspaceFolders?.[0];

    let uri: vscode.Uri;
    if (path.isAbsolute(setting)) {
      uri = vscode.Uri.file(setting);
    } else if (folder) {
      uri = vscode.Uri.joinPath(folder.uri, setting);
    } else {
      const directory = this.document.uri.with({
        path: this.document.uri.path.replace(/\/[^/]*$/, ''),
      });
      uri = vscode.Uri.joinPath(directory, setting);
    }

    void this.checkCustomCss(uri, setting);
    return uri;
  }

  /** Complains at most once per bad path, and forgets once it is good again. */
  private async checkCustomCss(uri: vscode.Uri, setting: string): Promise<void> {
    try {
      await vscode.workspace.fs.stat(uri);
      if (this.reportedBadCustomCss === setting) this.reportedBadCustomCss = null;
    } catch {
      if (this.reportedBadCustomCss === setting) return;
      this.reportedBadCustomCss = setting;
      void vscode.window.showWarningMessage(
        `MDX Studio: mdxstudio.customCss points at "${setting}", which could not be read.`
      );
    }
  }

  /** Reloads the preview when the user's stylesheet changes on disk. */
  private watchCustomCss(uri: vscode.Uri | null): void {
    const same = this.customCssUri?.toString() === uri?.toString();
    if (same && (uri === null || this.customCssWatcher)) return;

    this.customCssWatcher?.dispose();
    this.customCssWatcher = null;
    this.customCssUri = uri;
    if (!uri) return;

    const directory = uri.with({ path: uri.path.replace(/\/[^/]*$/, '') });
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(directory, basename(uri))
    );
    const onChange = () => {
      if (!this.disposed) this.reload();
    };
    watcher.onDidChange(onChange, null, this.disposables);
    watcher.onDidCreate(onChange, null, this.disposables);
    watcher.onDidDelete(onChange, null, this.disposables);
    this.customCssWatcher = watcher;
    this.disposables.push(watcher);
  }

  /* ---------------------------------------------------------------- *
   * The workspace's mdxstudio.config.js
   * ---------------------------------------------------------------- */

  /**
   * The config file this document should be rendered with, or null.
   *
   * Looked for whatever trust says, because the file's *existence* is what the
   * restricted banner has to report - "this workspace has one and it is not
   * being loaded" is the message worth showing, and a stat is not an execution.
   * Whether it is loaded is `ConfigPolicy.enabled`, decided in `policy.ts`.
   */
  private async findConfig(policy: ConfigPolicy): Promise<vscode.Uri | null> {
    const folder = vscode.workspace.getWorkspaceFolder(this.document.uri) ?? null;

    for (const location of configLocations(policy, folder !== null)) {
      const uri = this.configUriFor(location, folder);
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.Directory) {
          if (policy.path) this.reportedBadConfig = null;
          return uri;
        }
      } catch {
        // Not there. Try the next name - or, for a file the setting named,
        // fall through and say so, because that one was asked for by name.
      }
    }

    if (policy.path && this.reportedBadConfig !== policy.path) {
      this.reportedBadConfig = policy.path;
      void vscode.window.showWarningMessage(
        `MDX Studio: mdxstudio.config points at "${policy.path}", which could not be read.`
      );
    }
    return null;
  }

  /** Where one candidate from `configLocations` actually lives. */
  private configUriFor(
    location: ConfigLocation,
    folder: vscode.WorkspaceFolder | null
  ): vscode.Uri {
    if (location.base === 'absolute') return vscode.Uri.file(location.path);
    if (location.base === 'folder' && folder) {
      return vscode.Uri.joinPath(folder.uri, location.path);
    }
    const uri = this.document.uri;
    return vscode.Uri.joinPath(uri.with({ path: uri.path.replace(/\/[^/]*$/, '') }), location.path);
  }

  /**
   * Reloads the preview when the config changes on disk.
   *
   * Watches the *names*, not the file that was found, so writing an
   * `mdxstudio.config.js` into a folder that had none brings its components in
   * without a reopen - and deleting one takes them away again. Running even
   * while untrusted is deliberate: adding a config there changes the banner,
   * and a banner that only appears if you reopen the file is a banner nobody
   * reads.
   */
  private watchConfig(policy: ConfigPolicy): void {
    const target = this.configWatchTarget(policy);
    const key = target ? `${target.baseUri.toString()}/${target.pattern}` : null;
    if (key === this.configWatchKey && (key === null || this.configWatcher)) return;

    this.configWatcher?.dispose();
    this.configWatcher = null;
    this.configWatchKey = key;
    if (!target) return;

    const watcher = vscode.workspace.createFileSystemWatcher(target);
    const onChange = () => {
      if (!this.disposed) this.reload();
    };
    watcher.onDidChange(onChange, null, this.disposables);
    watcher.onDidCreate(onChange, null, this.disposables);
    watcher.onDidDelete(onChange, null, this.disposables);
    this.configWatcher = watcher;
    this.disposables.push(watcher);
  }

  private configWatchTarget(policy: ConfigPolicy): vscode.RelativePattern | null {
    const folder = vscode.workspace.getWorkspaceFolder(this.document.uri) ?? null;
    const [first] = configLocations(policy, folder !== null);
    if (!first) return null;

    if (policy.path) {
      const uri = this.configUriFor(first, folder);
      return new vscode.RelativePattern(
        uri.with({ path: uri.path.replace(/\/[^/]*$/, '') }),
        basename(uri)
      );
    }

    // Discovery: both names at once, so neither appearing goes unnoticed.
    if (!folder) return null;
    return new vscode.RelativePattern(folder, 'mdxstudio.config.{js,mjs}');
  }

  /* ---------------------------------------------------------------- *
   * Export
   * ---------------------------------------------------------------- */

  /**
   * Writes what is on screen to a standalone `.html` file.
   *
   * The markup comes from the webview because the webview is the only thing
   * that has it: Mermaid resolves after the first paint, the flow graph
   * measures itself and Recharts draws its own SVG, so re-rendering here would
   * produce a different - and emptier - document than the one being looked at.
   */
  async exportToHtml(): Promise<void> {
    if (this.disposed) return;

    const payload = await this.requestExport();
    if (!payload) {
      void vscode.window.showWarningMessage(
        'MDX Studio: the preview did not answer in time; nothing was exported.'
      );
      return;
    }

    const source = this.document.uri;
    const defaultUri = source.with({ path: source.path.replace(/\.[^./]*$/, '') + '.html' });
    const destination = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { 'HTML file': ['html'] },
      title: 'Export preview to HTML',
    });
    if (!destination) return;

    let styleSheet = '';
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'main.css')
      );
      styleSheet = new TextDecoder().decode(bytes);
    } catch {
      void vscode.window.showWarningMessage(
        'MDX Studio: the preview stylesheet could not be read; the export will be unstyled.'
      );
    }

    const assets = await Promise.all(
      payload.assets.map((asset) => this.inlineAsset(asset))
    );

    const html = buildExportDocument({
      title: basename(source),
      bodyHtml: payload.html,
      rootCss: payload.rootCss,
      styleSheet,
      assets,
    });

    try {
      await vscode.workspace.fs.writeFile(destination, new TextEncoder().encode(html));
    } catch (error) {
      void vscode.window.showErrorMessage(
        `MDX Studio: could not write ${destination.fsPath}: ${String(error)}`
      );
      return;
    }

    const open = 'Open';
    const choice = await vscode.window.showInformationMessage(
      `MDX Studio: exported to ${basename(destination)}.`,
      open
    );
    if (choice === open) await vscode.env.openExternal(destination);
  }

  private requestExport(): Promise<ExportPayload | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pendingExport === settle) this.pendingExport = null;
        resolve(null);
      }, EXPORT_TIMEOUT_MS);

      const settle = (payload: ExportPayload | null) => {
        clearTimeout(timer);
        resolve(payload);
      };

      this.pendingExport = settle;
      this.post({ type: 'export' });
    });
  }

  /** A local image becomes a `data:` URI; anything already absolute is left alone. */
  private async inlineAsset(source: string): Promise<string> {
    if (source === '' || source.startsWith('data:') || isExternalLink(source)) return source;

    const base = this.document.uri;
    const folder = vscode.workspace.getWorkspaceFolder(base);
    const resolved = resolveLinkPath(source, base.path, folder ? folder.uri.path : null);
    if (resolved === null) return source;

    try {
      const bytes = await vscode.workspace.fs.readFile(base.with({ path: resolved }));
      return `data:${mimeTypeFor(resolved)};base64,${Buffer.from(bytes).toString('base64')}`;
    } catch {
      // An image that is not there in the preview is not there in the export
      // either; leaving the path in place is more useful than an empty src.
      return source;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = null;
    this.pendingExport?.(null);
    this.pendingExport = null;
    void vscode.commands.executeCommand('setContext', 'mdxstudio.previewFocus', false);
    this.onDisposed(this);
    for (const disposable of this.disposables.splice(0)) {
      try {
        disposable.dispose();
      } catch {
        /* a panel disposing twice is not worth reporting */
      }
    }
    this.customCssWatcher = null;
    this.configWatcher = null;
    this.panel.dispose();
  }
}

/** Every directory the webview may load a file from. */
function localRootsFor(
  uri: vscode.Uri,
  extensionUri: vscode.Uri,
  customCssUri?: vscode.Uri | null,
  configUri?: vscode.Uri | null
): vscode.Uri[] {
  const roots = [extensionUri, uri.with({ path: uri.path.replace(/\/[^/]*$/, '') })];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.push(folder.uri);
  }
  // The user's stylesheet may live anywhere, including outside the workspace.
  // Its folder is granted rather than the CSP being loosened.
  if (customCssUri) {
    roots.push(customCssUri.with({ path: customCssUri.path.replace(/\/[^/]*$/, '') }));
  }
  // Same for a config named by absolute path. A config inside the workspace is
  // already covered by the folder above; this is the only reason the grant is
  // ever wider than the workspace, and it takes the user typing the path.
  if (configUri) {
    roots.push(configUri.with({ path: configUri.path.replace(/\/[^/]*$/, '') }));
  }
  return roots;
}

const MIME_TYPES: Record<string, string> = {
  '.apng': 'image/apng',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function mimeTypeFor(filePath: string): string {
  const match = /\.[^./]+$/.exec(filePath);
  return (match && MIME_TYPES[match[0].toLowerCase()]) || 'application/octet-stream';
}

function previewTitle(uri: vscode.Uri): string {
  return `Preview ${basename(uri)}`;
}

function basename(uri: vscode.Uri): string {
  const segments = uri.path.split('/');
  return segments[segments.length - 1] || uri.path;
}

function safeText(document: vscode.TextDocument): string {
  try {
    return document.getText();
  } catch {
    return '';
  }
}
