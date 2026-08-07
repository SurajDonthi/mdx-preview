export type ThemeId =
  | 'frosted-glass'
  | 'github-light'
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'editorial'
  | 'cyberpunk'
  | 'forest';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  category: 'light' | 'dark';
  fontFamily: string;
  bgClass: string;
  textClass: string;
  headingClass: string;
  cardBgClass: string;
  borderClass: string;
  codeBgClass: string;
  codeTextClass: string;
  accentClass: string;
  primaryButtonClass: string;
  badgeClass: string;
  previewBg: string;
  previewText: string;
  headingFont?: string;
  /**
   * `--mdxkit-*` custom properties the renderer stamps on its root.
   *
   * This is how a preset reaches the stylesheets the packages ship: the
   * `*Class` fields above are Tailwind utility strings and mean nothing to a
   * consumer who does not use Tailwind, so every value that actually has to
   * reach the DOM travels through here as plain CSS.
   */
  cssVars?: Record<string, string>;
}

export interface Frontmatter {
  title?: string;
  description?: string;
  author?: string;
  authorAvatar?: string;
  date?: string;
  tags?: string[];
  category?: string;
  status?: string;
  readTime?: string;
  [key: string]: unknown;
}

export interface HeaderItem {
  id: string;
  text: string;
  level: number; // 1, 2, 3, 4
}

export interface DocumentStats {
  words: number;
  characters: number;
  readingTimeMinutes: number;
  headingsCount: number;
}

/** Whether the tree is being rendered for the screen or for the PDF export pass. */
export type MdxRenderMode = 'live' | 'pdf';

/** Light/dark family of the active theme. */
export type MdxThemeCategory = 'light' | 'dark';

/**
 * How much of an MDX `{...}` expression the renderer will evaluate.
 *
 * - `'full'` runs the expression with real JavaScript semantics, so a document
 *   can map over data, call functions and build components inline. Meant for
 *   documents the user wrote themselves.
 * - `'literals'` only builds values the syntax spells out - strings, numbers,
 *   booleans, arrays, plain objects, substitution-free template literals - and
 *   omits anything else with a warning. Meant for content the host does not
 *   trust and is not rendering inside a sandbox.
 */
export type MdxExpressionMode = 'full' | 'literals';

/**
 * Ambient render settings every MDX component can read from `MdxRenderContext`
 * instead of receiving them as props through the whole tree.
 */
export interface MdxRenderSettings {
  renderMode: MdxRenderMode;
  themeCategory: MdxThemeCategory;
}
