import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import type { MdxRegistry, ThemeId } from '@mdxstudio/core';
import { MdxRenderer, THEMES } from '@mdxstudio/react';

import { startGuest } from './index';

/**
 * The default guest: renders the document with `@mdxstudio/react`'s `MdxRenderer`.
 *
 * This is the entry an application bundles into a standalone script and passes
 * to `<SandboxedMdx guestScript={...} />`. Applications that register extra
 * components (Mermaid, charts, flow graphs) build their own entry and pass a
 * registry, exactly as they would for the unsandboxed renderer - the sandbox
 * does not restrict what a document may contain, only what it may reach.
 */
export interface MdxGuestOptions {
  /** Components available to the document. Defaults to `@mdxstudio/react`'s built-ins. */
  registry?: MdxRegistry;
  /** Theme used when the host does not send one. */
  defaultTheme?: ThemeId;
}

interface MdxGuestProps {
  theme?: ThemeId;
  showFrontmatterHeader?: boolean;
}

/** Resolves once the browser has laid out the tree React just committed. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function startMdxGuest(options: MdxGuestOptions = {}): void {
  const fallbackTheme = options.defaultTheme ?? 'github-light';
  let root: Root | null = null;

  startGuest({
    render: async ({ container, content, props }) => {
      // One root for the frame's lifetime: re-creating it on every document
      // update would throw away the component state the document is holding,
      // which is the thing the sandbox exists to preserve.
      root ??= createRoot(container);

      const { theme, showFrontmatterHeader } = props as MdxGuestProps;
      const themeConfig = (theme && THEMES[theme]) || THEMES[fallbackTheme];

      root.render(
        <React.StrictMode>
          <MdxRenderer
            content={content}
            themeConfig={themeConfig}
            showFrontmatterHeader={showFrontmatterHeader !== false}
            registry={options.registry}
          />
        </React.StrictMode>
      );

      // `render` is asynchronous, so measuring immediately would report the
      // previous document's height. Wait for the commit to be painted.
      await nextFrame();
    },
  });
}
