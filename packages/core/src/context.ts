import { createContext } from 'react';
import type { MdxRenderSettings } from './types';

/**
 * Ambient render settings for an MDX tree.
 *
 * `@mdxkit/react`'s `MdxRenderer` provides it; every component package
 * (`@mdxkit/mermaid`, `@mdxkit/flow`, ...) reads it so that a component knows
 * whether it is on screen or in the PDF export pass without the host having to
 * thread props through the document.
 */
export const MdxRenderContext = createContext<MdxRenderSettings>({
  renderMode: 'live',
  themeCategory: 'light',
});
