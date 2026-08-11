import * as vscode from 'vscode';
import type { MdxExpressionMode } from '@mdxstudio/core';

import {
  configuredExpressionMode,
  isRestrictedByTrust,
  resolveConfigPolicy,
  resolveExpressionMode,
} from './policy';
import type { ConfigPolicy } from './policy';

/** When the preview re-renders. See `mdxstudio.updateMode`. */
export type MdxUpdateMode = 'onType' | 'onSave' | 'manual';

export interface MdxPreviewSettings {
  /** What `mdxstudio.expressions` asks for, before trust is applied. */
  configuredExpressions: MdxExpressionMode;
  /** What the renderer actually gets. Never higher than the above. */
  expressions: MdxExpressionMode;
  /** True when workspace trust - not the setting - is what lowered it. */
  restricted: boolean;
  updateMode: MdxUpdateMode;
  delay: number;
  showFrontmatterHeader: boolean;
  scrollPreviewWithEditor: boolean;
  scrollEditorWithPreview: boolean;
  highlightCurrentLine: boolean;
  /** `mdxstudio.customCss` verbatim: empty, workspace-relative or absolute. */
  customCss: string;
  /** `mdxstudio.config` after trust has had its say. See `policy.ts`. */
  config: ConfigPolicy;
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
 *
 * `vscode.workspace.isTrusted` is folded in here rather than at each call site,
 * because a security decision that has to be remembered at four call sites is a
 * security decision that will be forgotten at one of them.
 */
export function readSettings(resource?: vscode.Uri): MdxPreviewSettings {
  const config = vscode.workspace.getConfiguration('mdxstudio', resource ?? null);
  const expressions = config.get<string>('expressions', 'full');
  const isTrusted = vscode.workspace.isTrusted;

  return {
    configuredExpressions: configuredExpressionMode(expressions),
    expressions: resolveExpressionMode(expressions, isTrusted),
    restricted: isRestrictedByTrust(expressions, isTrusted),
    updateMode: updateMode(config.get<string>('updateMode', 'onType')),
    delay: clamp(config.get<number>('preview.delay', 300), 0, 5000),
    showFrontmatterHeader: config.get<boolean>('preview.showFrontmatterHeader', true),
    scrollPreviewWithEditor: config.get<boolean>('preview.scrollPreviewWithEditor', true),
    scrollEditorWithPreview: config.get<boolean>('preview.scrollEditorWithPreview', true),
    highlightCurrentLine: config.get<boolean>('highlightCurrentLine', true),
    customCss: (config.get<string>('customCss', '') ?? '').trim(),
    config: resolveConfigPolicy(config.get<string>('config', ''), isTrusted),
  };
}

function updateMode(value: string | undefined): MdxUpdateMode {
  return value === 'onSave' || value === 'manual' ? value : 'onType';
}

function clamp(value: number, low: number, high: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return low;
  return Math.min(high, Math.max(low, value));
}

/**
 * True when a change touches something that is baked into the preview document
 * and so cannot be applied in place.
 *
 * `mdxstudio.expressions` decides whether the CSP grants `'unsafe-eval'`, and a
 * CSP is fixed for the lifetime of a document. `mdxstudio.customCss` is a
 * `<link>` in the same `<head>`, and changing it also changes which folders the
 * webview is allowed to read. `mdxstudio.config` does both: it decides whether
 * `script-src` names the webview's own origin, and which file may be imported
 * from it. Callers rebuild the HTML when this returns true.
 */
export function affectsPreviewDocument(
  event: vscode.ConfigurationChangeEvent,
  resource?: vscode.Uri
): boolean {
  return (
    event.affectsConfiguration('mdxstudio.expressions', resource) ||
    event.affectsConfiguration('mdxstudio.customCss', resource) ||
    event.affectsConfiguration('mdxstudio.config', resource)
  );
}
