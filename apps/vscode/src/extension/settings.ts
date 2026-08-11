import * as vscode from 'vscode';
import type { MdxExpressionMode } from '@mdxstudio/core';

export interface MdxPreviewSettings {
  expressions: MdxExpressionMode;
  delay: number;
  showFrontmatterHeader: boolean;
  scrollPreviewWithEditor: boolean;
  scrollEditorWithPreview: boolean;
}

/** Whether opening an `.mdx` file should open the preview beside it. */
export function autoPreviewEnabled(resource?: vscode.Uri): boolean {
  return vscode.workspace
    .getConfiguration('mdxstudio', resource ?? null)
    .get<boolean>('autoPreview', true);
}

/**
 * Reads the `mdxstudio.*` section, scoped to the document being previewed so a
 * workspace or folder setting applies.
 */
export function readSettings(resource?: vscode.Uri): MdxPreviewSettings {
  const config = vscode.workspace.getConfiguration('mdxstudio', resource ?? null);
  const expressions = config.get<string>('expressions', 'full');

  return {
    expressions: expressions === 'literals' ? 'literals' : 'full',
    delay: clamp(config.get<number>('preview.delay', 300), 0, 5000),
    showFrontmatterHeader: config.get<boolean>('preview.showFrontmatterHeader', true),
    scrollPreviewWithEditor: config.get<boolean>('preview.scrollPreviewWithEditor', true),
    scrollEditorWithPreview: config.get<boolean>('preview.scrollEditorWithPreview', true),
  };
}

function clamp(value: number, low: number, high: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * True when a change touches something the preview reads.
 *
 * `mdxstudio.expressions` is the one that cannot be applied in place: it decides
 * whether the webview's CSP grants `'unsafe-eval'`, and a CSP is fixed for the
 * lifetime of a document. Callers rebuild the HTML when this returns true.
 */
export function affectsCsp(event: vscode.ConfigurationChangeEvent, resource?: vscode.Uri): boolean {
  return event.affectsConfiguration('mdxstudio.expressions', resource);
}
