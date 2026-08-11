import React from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';

import type { MdxExpressionMode, MdxRegistry, ThemeId } from '@mdxstudio/core';
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
  /**
   * Forwarded from the host. Inside the frame `'full'` is not the risk it is in
   * the page - there is no origin, no storage and no network to reach - so the
   * renderer's own default stands, and a host that wants the stricter mode says
   * so rather than having it imposed.
   */
  expressions?: MdxExpressionMode;
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

      const { theme, showFrontmatterHeader, expressions } = props as MdxGuestProps;
      const themeConfig = (theme && THEMES[theme]) || THEMES[fallbackTheme];

      root.render(
        <React.StrictMode>
          <MdxRenderer
            content={content}
            themeConfig={themeConfig}
            showFrontmatterHeader={showFrontmatterHeader !== false}
            registry={options.registry}
            expressions={expressions === 'literals' ? 'literals' : 'full'}
          />
        </React.StrictMode>
      );

      // `render` is asynchronous, so measuring immediately would report the
      // previous document's height. Wait for the commit to be painted.
      await nextFrame();
    },
  });
}
