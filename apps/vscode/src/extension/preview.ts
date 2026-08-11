import * as vscode from 'vscode';

import type { HostMessage, PreviewState, WebviewMessage } from '../shared/protocol';
import { buildPreviewHtml } from './html';
import { readSettings } from './settings';

export const PREVIEW_VIEW_TYPE = 'mdxstudio.preview';

/** How long after one side scrolls the other side's echo is ignored. */
const SCROLL_ECHO_WINDOW_MS = 400;

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
        this.scheduleUpdate();
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
        if (event.affectsConfiguration('mdxstudio.expressions', this.document.uri)) {
          // The expression mode decides whether the CSP grants 'unsafe-eval',
          // and a document's CSP cannot be changed after it has loaded.
          this.reload();
          return;
        }
        this.scheduleUpdate(true);
      },
      null,
      this.disposables
    );

    vscode.window.onDidChangeTextEditorVisibleRanges(
      (event) => this.syncPreviewToEditor(event),
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
    // A document in another folder needs its own resource root before any image
    // in it will load.
    this.panel.webview.options = {
      enableScripts: true,
      localResourceRoots: localRootsFor(document.uri, this.extensionUri),
    };
    this.reload();
  }

  refresh(): void {
    this.post({ type: 'refresh' });
    this.scheduleUpdate(true);
  }

  /** Rebuilds the whole document, which is the only way to change its CSP. */
  private reload(): void {
    const settings = readSettings(this.document.uri);
    this.webviewReady = false;
    this.pendingState = this.buildState();
    this.panel.webview.html = buildPreviewHtml({
      webview: this.panel.webview,
      extensionUri: this.extensionUri,
      expressions: settings.expressions,
      title: previewTitle(this.document.uri),
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

    return {
      uri: uri.toString(),
      fileName: basename(uri),
      content: safeText(this.document),
      baseUri: `${this.panel.webview.asWebviewUri(directory).toString()}/`,
      workspaceUri: folder
        ? `${this.panel.webview.asWebviewUri(folder.uri).toString()}/`
        : null,
      expressions: settings.expressions,
      showFrontmatterHeader: settings.showFrontmatterHeader,
      scrollEditorWithPreview: settings.scrollEditorWithPreview,
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
        return;
      }
      case 'scroll':
        this.syncEditorToPreview(message.line, message.revision);
        return;
      case 'openLink':
        void this.openLink(message.href);
        return;
      case 'error':
        console.error(`[mdxstudio] preview: ${message.message}`);
        return;
    }
  }

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
   * A relative link in the document. Resolved against the document's folder and
   * handed to VS Code, so `[see](./OTHER.mdx)` opens the file in an editor.
   */
  private async openLink(href: string): Promise<void> {
    const [path, fragment] = splitFragment(href);
    const base = this.document.uri;

    let target: vscode.Uri;
    if (path.startsWith('/')) {
      const folder = vscode.workspace.getWorkspaceFolder(base);
      const root = folder ? folder.uri : base.with({ path: base.path.replace(/\/[^/]*$/, '') });
      target = vscode.Uri.joinPath(root, path.slice(1));
    } else if (path === '') {
      target = base;
    } else {
      target = vscode.Uri.joinPath(base.with({ path: base.path.replace(/\/[^/]*$/, '') }), path);
    }

    try {
      const document = await vscode.workspace.openTextDocument(target);
      const editor = await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Active,
        preserveFocus: false,
      });
      if (fragment) revealHeading(editor, fragment);
    } catch {
      // Not a text file (an image, a directory, a missing path): let VS Code
      // decide what to do with it rather than failing silently.
      await vscode.commands.executeCommand('vscode.open', target).then(undefined, () => {
        void vscode.window.showWarningMessage(`MDX Studio: could not open "${href}".`);
      });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = null;
    void vscode.commands.executeCommand('setContext', 'mdxstudio.previewFocus', false);
    this.onDisposed(this);
    for (const disposable of this.disposables.splice(0)) {
      try {
        disposable.dispose();
      } catch {
        /* a panel disposing twice is not worth reporting */
      }
    }
    this.panel.dispose();
  }
}

/** Every directory the webview may load a file from. */
function localRootsFor(uri: vscode.Uri, extensionUri: vscode.Uri): vscode.Uri[] {
  const roots = [extensionUri, uri.with({ path: uri.path.replace(/\/[^/]*$/, '') })];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    roots.push(folder.uri);
  }
  return roots;
}

function previewTitle(uri: vscode.Uri): string {
  return `Preview ${basename(uri)}`;
}

function basename(uri: vscode.Uri): string {
  const segments = uri.path.split('/');
  return segments[segments.length - 1] || uri.path;
}

function splitFragment(href: string): [string, string] {
  const index = href.indexOf('#');
  if (index < 0) return [href, ''];
  return [href.slice(0, index), href.slice(index + 1)];
}

function safeText(document: vscode.TextDocument): string {
  try {
    return document.getText();
  } catch {
    return '';
  }
}

/** Best-effort jump to `## Some Heading` after following a `file.mdx#anchor` link. */
function revealHeading(editor: vscode.TextEditor, fragment: string): void {
  const slug = fragment.toLowerCase();
  for (let line = 0; line < editor.document.lineCount; line++) {
    const text = editor.document.lineAt(line).text;
    const match = /^#{1,6}\s+(.*)$/.exec(text);
    if (!match) continue;
    const candidate = match[1]
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (candidate === slug) {
      editor.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.AtTop);
      editor.selection = new vscode.Selection(line, 0, line, 0);
      return;
    }
  }
}
