import * as vscode from 'vscode';

import { documentOutline, type OutlineHeading } from './outline';

/**
 * Headings in the outline view and the breadcrumbs.
 *
 * **`mdx` only, deliberately.** VS Code's built-in `markdown-language-features`
 * already contributes a document symbol provider for `markdown`, and registering
 * a second one does not replace it - both run and the outline shows every
 * heading twice. `.mdx` has no such provider, which is why the outline is empty
 * there today and why this exists.
 *
 * The headings themselves come from `outline.ts`, which asks `@mdxstudio/core`
 * rather than re-reading the file with a regex: the outline and the preview
 * agree about what a heading is, including that `# comment` inside a fenced
 * code block is not one.
 */
export class MdxDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.DocumentSymbol[] {
    if (token.isCancellationRequested) return [];
    return documentOutline(document.getText()).map((heading) =>
      toSymbol(heading, document)
    );
  }
}

/**
 * `range` is the whole section and `selectionRange` is the heading line, which
 * is what makes clicking a breadcrumb select the section while the cursor stays
 * where the reader can see what they picked.
 */
function toSymbol(
  heading: OutlineHeading,
  document: vscode.TextDocument
): vscode.DocumentSymbol {
  const lastLine = Math.max(0, Math.min(document.lineCount - 1, heading.endLine - 1));
  const firstLine = Math.max(0, Math.min(lastLine, heading.line - 1));

  const range = new vscode.Range(
    firstLine,
    0,
    lastLine,
    document.lineAt(lastLine).text.length
  );
  const selection = new vscode.Range(
    firstLine,
    0,
    firstLine,
    document.lineAt(firstLine).text.length
  );

  const symbol = new vscode.DocumentSymbol(
    heading.text,
    '',
    vscode.SymbolKind.String,
    range,
    selection
  );
  symbol.children = heading.children.map((child) => toSymbol(child, document));
  return symbol;
}
