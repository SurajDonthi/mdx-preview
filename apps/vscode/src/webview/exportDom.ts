/**
 * Serialising the preview for `MDX Studio: Export to HTML`.
 *
 * The webview is the only place the finished document exists. Mermaid resolves
 * after the first paint, the flow graph measures itself before it draws and
 * Recharts produces its SVG from a layout pass - re-rendering in the extension
 * host would produce a different, emptier document than the one on screen. So
 * the DOM is cloned here and the host assembles a file around it.
 *
 * Two things have to be undone on the way out:
 *
 * - **Image sources.** In the preview they are `vscode-resource` URLs that mean
 *   nothing outside the editor, and the webview cannot read them back to inline
 *   them (its CSP has no `connect-src`, on purpose). `documentBase.tsx` keeps
 *   the document's own relative path on each image, so the clone puts a token
 *   there and the host reads the file off disk.
 * - **The theme.** The renderer's inline `--mdxstudio-*` variables all point at
 *   `--vscode-*` properties that only exist inside VS Code, so the resolved
 *   values are read out of the live document and travel with the markup.
 */

import { assetToken, type ExportPayload } from '../shared/protocol';

/** The attribute `MdxImage` keeps the document-relative path in. */
export const SOURCE_ATTRIBUTE = 'data-mdxstudio-src';

export function serialiseForExport(container: HTMLElement): ExportPayload {
  const clone = container.cloneNode(true) as HTMLElement;
  const assets: string[] = [];

  for (const image of Array.from(clone.querySelectorAll<HTMLElement>('img'))) {
    const original = image.getAttribute(SOURCE_ATTRIBUTE);
    image.removeAttribute(SOURCE_ATTRIBUTE);
    // No attribute means the src was already absolute (`https:`, `data:`) and
    // there is nothing to resolve.
    if (original === null) continue;
    image.setAttribute('src', assetToken(assets.length));
    assets.push(original);
  }

  // A `<details>` the reader opened, a `<input type=checkbox>` they ticked: the
  // property moved but the attribute did not, so `outerHTML` would lose it.
  for (const details of Array.from(clone.querySelectorAll('details'))) {
    if (details.open) details.setAttribute('open', '');
    else details.removeAttribute('open');
  }

  return {
    html: clone.outerHTML,
    rootCss: resolvedRootVariables(),
    assets,
  };
}

/**
 * The `--vscode-*` custom properties, with their `var()` chains already
 * substituted.
 *
 * The *names* are gathered from wherever VS Code happened to declare them -
 * inline on `<html>` in some versions, a `:root` rule in others - but every
 * *value* is read back through `getComputedStyle`, which is the one answer that
 * is right regardless.
 */
function resolvedRootVariables(): string {
  const names = new Set<string>();

  collectFrom(document.documentElement.style, names);
  collectFrom(document.body.style, names);

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      // A stylesheet from another origin. Nothing of ours lives there.
      continue;
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!/^(:root|html|body)\b/.test(rule.selectorText)) continue;
      collectFrom(rule.style, names);
    }
  }

  const computed = getComputedStyle(document.documentElement);
  const lines: string[] = [];
  for (const name of Array.from(names).sort()) {
    const value = computed.getPropertyValue(name).trim();
    if (value === '') continue;
    lines.push(`  ${name}: ${value};`);
  }
  return lines.join('\n');
}

function collectFrom(style: CSSStyleDeclaration, names: Set<string>): void {
  for (let index = 0; index < style.length; index++) {
    const name = style.item(index);
    if (name.startsWith('--vscode')) names.add(name);
  }
}
