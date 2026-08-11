import * as vscode from 'vscode';

import {
  MdxPreview,
  PREVIEW_VIEW_TYPE,
  isMdxDocument,
  isPreviewableDocument,
} from './preview';
import { autoPreviewEnabled } from './settings';

/**
 * Owns the open previews and decides when one appears.
 *
 * At most one per editor column, which is how the built-in Markdown preview
 * behaves - "Open Preview to the Side" twice reveals the panel that is already
 * there rather than stacking a second one - and previews are *dynamic*: they
 * retarget to whichever document the reader moved to instead of being pinned to
 * the one they were opened from. A folder of documents must not become a folder
 * of panels.
 */
class PreviewManager {
  private readonly previews: MdxPreview[] = [];
  /**
   * The document the last auto-preview decision was made about.
   *
   * `onDidChangeActiveTextEditor` also fires when the same editor merely gets
   * focus back - clicking from the preview panel into the editor, for one - and
   * that is not an "opened an `.mdx` file" event. Comparing against this is what
   * separates a switch from a refocus.
   */
  private lastSeenDocument: string | null = null;
  /**
   * The document a preview was showing when the user closed it. Auto-preview
   * stays out of the way for that one; opening a different file brings it back.
   */
  private dismissedDocument: string | null = null;

  constructor(private readonly extensionUri: vscode.Uri) {}

  show(document: vscode.TextDocument, column: vscode.ViewColumn): void {
    this.lastSeenDocument = document.uri.toString();
    this.dismissedDocument = null;

    // `ViewColumn.Beside` is the sentinel -2, never a column a panel reports
    // living in, so it can only be matched against an existing preview after it
    // has been resolved to a real column. Getting this wrong is what stacks a
    // second panel on every invocation.
    const beside = column === vscode.ViewColumn.Beside;
    const target = beside ? nextColumn() : column;

    // "To the side" reuses the preview that is already open wherever it is.
    // One panel, retargeted - a folder of documents must not become a folder of
    // panels. Only "Open Preview" in a specific column looks for that column.
    const existing = beside
      ? this.previews[0]
      : this.previews.find((preview) => preview.viewColumn === target);

    if (existing) {
      existing.follow(document);
      existing.reveal();
      return;
    }

    this.previews.push(
      MdxPreview.create(document, target, this.extensionUri, (preview) => this.forget(preview))
    );
  }

  restore(panel: vscode.WebviewPanel, document: vscode.TextDocument): void {
    this.lastSeenDocument = document.uri.toString();
    this.previews.push(
      MdxPreview.restore(panel, document, this.extensionUri, (preview) => this.forget(preview))
    );
  }

  /**
   * Every open preview switches to the newly active `.mdx` editor - and if none
   * is open and `mdxstudio.autoPreview` is on, one opens beside it.
   */
  followActiveEditor(editor: vscode.TextEditor | undefined): void {
    // `undefined` means a webview or a panel took focus. Not a document switch,
    // and specifically not a reason to forget which document we last saw.
    if (!editor || !isPreviewableDocument(editor.document)) return;

    const uri = editor.document.uri.toString();

    // An open preview follows whatever the reader moved to, Markdown included:
    // retargeting a panel the user asked for is not the same as volunteering one.
    if (this.previews.length > 0) {
      for (const preview of this.previews) preview.follow(editor.document);
      this.lastSeenDocument = uri;
      this.dismissedDocument = null;
      return;
    }

    const isSwitch = this.lastSeenDocument !== uri;
    this.lastSeenDocument = uri;

    if (!isSwitch) return;
    if (this.dismissedDocument === uri) return;
    // Auto-open is `.mdx` only. See `isMdxDocument`.
    if (!isMdxDocument(editor.document)) return;
    if (!autoPreviewEnabled(editor.document.uri)) return;

    // `MdxPreview.create` passes `preserveFocus`, so the cursor stays put.
    this.show(editor.document, vscode.ViewColumn.Beside);
  }

  refreshAll(): void {
    for (const preview of this.previews) preview.refresh();
  }

  private forget(preview: MdxPreview): void {
    const index = this.previews.indexOf(preview);
    if (index >= 0) this.previews.splice(index, 1);
    if (this.previews.length === 0) {
      this.dismissedDocument = preview.documentUri.toString();
    }
  }

  dispose(): void {
    for (const preview of this.previews.splice(0)) preview.dispose();
  }
}

/** The column `ViewColumn.Beside` would land in, as a real column number. */
function nextColumn(): vscode.ViewColumn {
  const active = vscode.window.activeTextEditor?.viewColumn;
  if (typeof active !== 'number' || active < vscode.ViewColumn.One) {
    return vscode.ViewColumn.Two;
  }
  return Math.min(active + 1, vscode.ViewColumn.Nine) as vscode.ViewColumn;
}

export function activate(context: vscode.ExtensionContext): void {
  const manager = new PreviewManager(context.extensionUri);
  context.subscriptions.push({ dispose: () => manager.dispose() });

  const resolveDocument = async (
    resource?: vscode.Uri
  ): Promise<vscode.TextDocument | undefined> => {
    if (resource) {
      try {
        return await vscode.workspace.openTextDocument(resource);
      } catch {
        void vscode.window.showErrorMessage(`MDX Studio: could not open ${resource.fsPath}.`);
        return undefined;
      }
    }

    const active = vscode.window.activeTextEditor;
    if (active && isPreviewableDocument(active.document)) return active.document;

    const visible = vscode.window.visibleTextEditors.find((editor) =>
      isPreviewableDocument(editor.document)
    );
    if (visible) return visible.document;

    void vscode.window.showInformationMessage(
      'MDX Studio: open an .mdx or .md file to preview it.'
    );
    return undefined;
  };

  const open = (column: vscode.ViewColumn) => async (resource?: vscode.Uri) => {
    const document = await resolveDocument(resource);
    if (document) manager.show(document, column);
  };

  context.subscriptions.push(
    vscode.commands.registerCommand('mdxstudio.showPreview', open(vscode.ViewColumn.Active)),
    vscode.commands.registerCommand('mdxstudio.showPreviewToSide', open(vscode.ViewColumn.Beside)),
    vscode.commands.registerCommand('mdxstudio.refreshPreview', () => manager.refreshAll()),
    vscode.window.onDidChangeActiveTextEditor((editor) => manager.followActiveEditor(editor))
  );

  // Previews survive a window reload: VS Code hands the panel back and we point
  // it at the document it was showing.
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer(PREVIEW_VIEW_TYPE, {
      async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
        const uri = (state as { uri?: string } | undefined)?.uri;
        if (!uri) {
          panel.dispose();
          return;
        }
        try {
          const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
          manager.restore(panel, document);
        } catch {
          panel.dispose();
        }
      },
    })
  );

  // The extension activates *because* an `.mdx` file is open, so the editor
  // that should trigger auto-preview is already active and will not fire
  // `onDidChangeActiveTextEditor` again. The delay lets the panel serializer
  // above restore an earlier preview first, so a window reload reuses that
  // panel instead of opening a second one next to it.
  const initialAutoPreview = setTimeout(
    () => manager.followActiveEditor(vscode.window.activeTextEditor),
    300
  );
  context.subscriptions.push({ dispose: () => clearTimeout(initialAutoPreview) });
}

export function deactivate(): void {
  /* the panels are disposed through context.subscriptions */
}
