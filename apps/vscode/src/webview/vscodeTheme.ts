/**
 * VS Code's theme, expressed as an mdxstudio `ThemeConfig`.
 *
 * The renderer takes colour from exactly two places: `themeConfig.category`,
 * which it stamps as `data-mdxstudio-theme` and which every package stylesheet
 * keys off, and `themeConfig.cssVars`, which it writes onto its root as an
 * inline style. So making the preview follow the editor is a mapping problem,
 * not a stylesheet-forking problem: point each `--mdxstudio-*` token at the
 * `--vscode-*` custom property that means the same thing and every component in
 * every package follows along, including the ones this file has never heard of.
 *
 * Nothing here hardcodes a colour except as a last-resort fallback. Values that
 * need a surface *step* - a card that has to read as raised above the page - are
 * mixed from the theme's own foreground over its own background, which produces
 * a visible step in a light theme and in a dark one without either being
 * spelled out.
 */

import { THEMES } from '@mdxstudio/react';
import type { MdxThemeCategory, ThemeConfig } from '@mdxstudio/core';

export type VsCodeThemeKind =
  | 'vscode-light'
  | 'vscode-dark'
  | 'vscode-high-contrast'
  | 'vscode-high-contrast-light';

/* ------------------------------------------------------------------ *
 * The VS Code side of the mapping
 * ------------------------------------------------------------------ */

const PAGE = 'var(--vscode-editor-background)';
const FG = 'var(--vscode-editor-foreground, var(--vscode-foreground))';
const MUTED = 'var(--vscode-descriptionForeground, var(--vscode-editor-foreground))';
const ACCENT = 'var(--vscode-textLink-foreground, var(--vscode-focusBorder))';
const ACCENT_HOVER = 'var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground))';

/** An opaque surface `percent` of the way from the page toward the text colour. */
const step = (percent: number) =>
  `color-mix(in srgb, var(--vscode-foreground) ${percent}%, var(--vscode-editor-background))`;

/** A translucent wash of one of the theme's own colours. */
const wash = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

const SURFACE_RAISED = step(5);
const SURFACE_SUNKEN = step(9);

/**
 * `contrastBorder` is only defined by high-contrast themes, which is exactly
 * when a hairline mix would be too faint to see - so it wins when it exists.
 */
const BORDER = `var(--vscode-contrastBorder, var(--vscode-panel-border, ${step(20)}))`;
const BORDER_STRONG = `var(--vscode-contrastBorder, var(--vscode-widget-border, ${step(30)}))`;

const CHART_BLUE = 'var(--vscode-charts-blue, #3794ff)';
const CHART_GREEN = 'var(--vscode-charts-green, #89d185)';
const CHART_YELLOW = 'var(--vscode-charts-yellow, #cca700)';
const CHART_RED = 'var(--vscode-charts-red, #f14c4c)';
const CHART_PURPLE = 'var(--vscode-charts-purple, #b180d7)';
const CHART_ORANGE = 'var(--vscode-charts-orange, #d18616)';

const WARNING = `var(--vscode-editorWarning-foreground, ${CHART_YELLOW})`;
const ERROR = `var(--vscode-editorError-foreground, ${CHART_RED})`;

function buildCssVars(): Record<string, string> {
  return {
    /* Typography. The editor's UI font, not its monospace one: this is prose. */
    '--mdxstudio-font-body': 'var(--vscode-font-family)',
    '--mdxstudio-font-mono':
      'var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)',
    '--mdxstudio-heading-font': 'inherit',
    '--mdxstudio-heading-tracking': 'normal',
    // Every surface is opaque here, so nothing behind the preview shows through
    // and there is nothing to blur.
    '--mdxstudio-surface-backdrop-filter': 'none',
    '--mdxstudio-blur-sm': '0px',
    '--mdxstudio-blur-md': '0px',
    '--mdxstudio-blur-lg': '0px',

    /* Surfaces */
    '--mdxstudio-surface-base': PAGE,
    '--mdxstudio-surface-sunken': SURFACE_SUNKEN,
    '--mdxstudio-surface-panel': SURFACE_RAISED,
    '--mdxstudio-card-bg': SURFACE_RAISED,
    '--mdxstudio-card-bg-strong': SURFACE_RAISED,
    '--mdxstudio-card-bg-soft': SURFACE_RAISED,
    '--mdxstudio-card-bg-faint': SURFACE_RAISED,
    '--mdxstudio-panel-bg': SURFACE_RAISED,
    '--mdxstudio-panel-bg-soft': SURFACE_RAISED,
    '--mdxstudio-sunken-bg': SURFACE_SUNKEN,
    '--mdxstudio-sunken-bg-strong': SURFACE_SUNKEN,
    '--mdxstudio-solid-bg': PAGE,
    '--mdxstudio-stripe-bg': step(3),
    '--mdxstudio-row-hover': `var(--vscode-list-hoverBackground, ${step(7)})`,
    '--mdxstudio-progress-track': SURFACE_SUNKEN,
    '--mdxstudio-scrollbar-thumb': 'var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.4))',
    '--mdxstudio-scrollbar-thumb-hover':
      'var(--vscode-scrollbarSlider-hoverBackground, rgba(128,128,128,0.6))',

    /* Text */
    '--mdxstudio-fg': FG,
    '--mdxstudio-fg-strong': FG,
    '--mdxstudio-fg-body': FG,
    '--mdxstudio-fg-secondary': 'var(--vscode-foreground)',
    '--mdxstudio-fg-muted': MUTED,
    '--mdxstudio-fg-subtle': MUTED,
    '--mdxstudio-fg-icon': MUTED,
    '--mdxstudio-fg-dim': MUTED,

    /* Borders */
    '--mdxstudio-border': BORDER,
    '--mdxstudio-border-soft': BORDER,
    '--mdxstudio-border-medium': BORDER,
    '--mdxstudio-border-divider': BORDER,
    '--mdxstudio-border-faint': BORDER,
    '--mdxstudio-border-strong': BORDER_STRONG,

    /* Accent - the editor's own link colour, so it matches the rest of the UI */
    '--mdxstudio-accent': ACCENT,
    '--mdxstudio-accent-hover': ACCENT_HOVER,
    '--mdxstudio-accent-marker': ACCENT,
    '--mdxstudio-accent-icon': ACCENT,
    '--mdxstudio-accent-contrast': 'var(--vscode-button-foreground, #ffffff)',
    '--mdxstudio-accent-soft-bg': wash(ACCENT, 14),
    '--mdxstudio-accent-soft-fg': ACCENT,
    '--mdxstudio-accent-soft-border': wash(ACCENT, 35),
    '--mdxstudio-accent-wash': wash(ACCENT, 10),
    '--mdxstudio-accent-tint': wash(ACCENT, 8),
    '--mdxstudio-accent-panel-bg': wash(ACCENT, 8),
    '--mdxstudio-accent-panel-border': wash(ACCENT, 30),

    /* Headings and links */
    '--mdxstudio-heading-fg': FG,
    '--mdxstudio-heading-border': BORDER,
    '--mdxstudio-link-fg': ACCENT,

    /* Inline tokens */
    '--mdxstudio-inline-code-bg': `var(--vscode-textCodeBlock-background, ${SURFACE_SUNKEN})`,
    '--mdxstudio-inline-code-fg': 'var(--vscode-textPreformat-foreground, var(--vscode-foreground))',
    '--mdxstudio-token-code-bg': `var(--vscode-textCodeBlock-background, ${SURFACE_SUNKEN})`,
    '--mdxstudio-token-code-fg': 'var(--vscode-textPreformat-foreground, var(--vscode-foreground))',
    '--mdxstudio-token-code-border': BORDER,
    '--mdxstudio-token-tag-bg': `var(--vscode-badge-background, ${SURFACE_SUNKEN})`,
    '--mdxstudio-token-tag-fg': 'var(--vscode-badge-foreground, var(--vscode-foreground))',
    '--mdxstudio-token-tag-border': BORDER,
    '--mdxstudio-kbd-bg': `var(--vscode-keybindingLabel-background, ${SURFACE_SUNKEN})`,
    '--mdxstudio-kbd-fg': 'var(--vscode-keybindingLabel-foreground, var(--vscode-foreground))',
    '--mdxstudio-kbd-border': `var(--vscode-keybindingLabel-border, ${BORDER})`,

    /* Semantic tones. VS Code's chart palette is defined for every theme and is
       the only set of "meaning" colours a theme is guaranteed to expose. */
    '--mdxstudio-tone-info': CHART_BLUE,
    '--mdxstudio-tone-info-fg': CHART_BLUE,
    '--mdxstudio-tone-warning': CHART_YELLOW,
    '--mdxstudio-tone-warning-fg': CHART_YELLOW,
    '--mdxstudio-tone-success': CHART_GREEN,
    '--mdxstudio-tone-success-fg': CHART_GREEN,
    '--mdxstudio-tone-error': CHART_RED,
    '--mdxstudio-tone-error-fg': CHART_RED,
    '--mdxstudio-tone-note': CHART_PURPLE,
    '--mdxstudio-tone-note-fg': CHART_PURPLE,
    '--mdxstudio-trend-up-fg': CHART_GREEN,
    '--mdxstudio-trend-down-fg': CHART_RED,
    '--mdxstudio-trend-flat-fg': MUTED,

    /* Badges */
    '--mdxstudio-badge-bg': wash(ACCENT, 14),
    '--mdxstudio-badge-fg': ACCENT,
    '--mdxstudio-badge-border': wash(ACCENT, 35),
    '--mdxstudio-badge-indigo-bg': wash(ACCENT, 14),
    '--mdxstudio-badge-indigo-fg': ACCENT,
    '--mdxstudio-badge-indigo-border': wash(ACCENT, 35),
    '--mdxstudio-badge-emerald-bg': wash(CHART_GREEN, 14),
    '--mdxstudio-badge-emerald-fg': CHART_GREEN,
    '--mdxstudio-badge-emerald-border': wash(CHART_GREEN, 35),
    '--mdxstudio-badge-rose-bg': wash(CHART_RED, 14),
    '--mdxstudio-badge-rose-fg': CHART_RED,
    '--mdxstudio-badge-rose-border': wash(CHART_RED, 35),
    '--mdxstudio-badge-amber-bg': wash(CHART_ORANGE, 14),
    '--mdxstudio-badge-amber-fg': CHART_ORANGE,
    '--mdxstudio-badge-amber-border': wash(CHART_ORANGE, 35),
    '--mdxstudio-badge-slate-bg': SURFACE_SUNKEN,
    '--mdxstudio-badge-slate-fg': MUTED,
    '--mdxstudio-badge-slate-border': BORDER,

    /* Buttons */
    '--mdxstudio-button-secondary-bg':
      'var(--vscode-button-secondaryBackground, var(--vscode-button-background))',
    '--mdxstudio-button-secondary-bg-hover':
      'var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground))',
    '--mdxstudio-button-secondary-fg':
      'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))',
    '--mdxstudio-button-outline-border': BORDER_STRONG,
    '--mdxstudio-button-outline-fg': FG,
    '--mdxstudio-button-outline-bg-hover': `var(--vscode-list-hoverBackground, ${step(7)})`,
    '--mdxstudio-counter-hover-bg': `var(--vscode-list-hoverBackground, ${step(7)})`,
    '--mdxstudio-counter-reset-fg-hover': FG,
    '--mdxstudio-accordion-trigger-fg': FG,
    '--mdxstudio-accordion-trigger-bg-hover': `var(--vscode-list-hoverBackground, ${step(7)})`,
    '--mdxstudio-tabs-tab-fg-hover': FG,

    /* Warning banners and unknown-component notices */
    '--mdxstudio-alert-fg': WARNING,
    '--mdxstudio-alert-icon': WARNING,
    '--mdxstudio-alert-meta-fg': MUTED,
    '--mdxstudio-alert-bg': wash(WARNING, 12),
    '--mdxstudio-alert-border': wash(WARNING, 35),
    '--mdxstudio-unknown-fg': ERROR,
    '--mdxstudio-unknown-bg': wash(ERROR, 10),
    '--mdxstudio-unknown-border': wash(ERROR, 30),

    /* Frontmatter header */
    '--mdxstudio-frontmatter-bg': SURFACE_RAISED,
    '--mdxstudio-frontmatter-field-bg': SURFACE_SUNKEN,
    '--mdxstudio-frontmatter-field-border': BORDER,
    '--mdxstudio-frontmatter-field-label': MUTED,
    '--mdxstudio-frontmatter-field-value': FG,
    '--mdxstudio-frontmatter-author-fg': FG,
    '--mdxstudio-frontmatter-avatar-border': BORDER,
    '--mdxstudio-frontmatter-category-bg': wash(ACCENT, 12),
    '--mdxstudio-frontmatter-category-fg': ACCENT,
    '--mdxstudio-frontmatter-category-border': wash(ACCENT, 30),
    '--mdxstudio-frontmatter-status-bg': wash(CHART_GREEN, 12),
    '--mdxstudio-frontmatter-status-fg': CHART_GREEN,
    '--mdxstudio-frontmatter-status-border': wash(CHART_GREEN, 30),
    '--mdxstudio-frontmatter-status-dot': CHART_GREEN,

    /* @mdxstudio/charts - the card only; Recharts draws the series from props. */
    '--mdxstudio-chart-bg': SURFACE_RAISED,
    '--mdxstudio-chart-border': BORDER,
    '--mdxstudio-chart-title-fg': FG,

    /* @mdxstudio/mermaid - the card; the diagram is Mermaid's own theme, picked
       from `themeCategory` by the component itself. */
    '--mdxstudio-mermaid-bg': PAGE,
    '--mdxstudio-mermaid-canvas-bg': PAGE,
    '--mdxstudio-mermaid-border': BORDER,
    '--mdxstudio-mermaid-header-bg': SURFACE_RAISED,
    '--mdxstudio-mermaid-header-fg': MUTED,
    '--mdxstudio-mermaid-title-fg': FG,
    '--mdxstudio-mermaid-icon': ACCENT,
    '--mdxstudio-mermaid-button-bg': SURFACE_SUNKEN,
    '--mdxstudio-mermaid-button-bg-hover': `var(--vscode-list-hoverBackground, ${step(12)})`,
    '--mdxstudio-mermaid-button-fg': MUTED,
    '--mdxstudio-mermaid-button-fg-hover': FG,
    '--mdxstudio-mermaid-ok-fg': CHART_GREEN,
    '--mdxstudio-mermaid-muted-fg': MUTED,
    '--mdxstudio-mermaid-error-bg': wash(WARNING, 12),
    '--mdxstudio-mermaid-error-border': wash(WARNING, 30),
    '--mdxstudio-mermaid-error-fg': WARNING,
    '--mdxstudio-mermaid-error-title-fg': WARNING,
    '--mdxstudio-mermaid-error-detail-fg': FG,
    '--mdxstudio-mermaid-error-raw-bg': SURFACE_SUNKEN,
    '--mdxstudio-mermaid-error-raw-fg': FG,

    /* @mdxstudio/flow - chrome *and* the SVG palette, because the drawing's
       fills and strokes are these same custom properties. */
    '--mdxstudio-flow-bg': PAGE,
    '--mdxstudio-flow-border': BORDER,
    '--mdxstudio-flow-header-bg': SURFACE_RAISED,
    '--mdxstudio-flow-title-fg': FG,
    '--mdxstudio-flow-subtitle-fg': MUTED,
    '--mdxstudio-flow-icon': ACCENT,
    '--mdxstudio-flow-label-fg': MUTED,
    '--mdxstudio-flow-hint-fg': MUTED,
    '--mdxstudio-flow-action-fg': ACCENT,
    '--mdxstudio-flow-chip-fg': FG,
    '--mdxstudio-flow-chip-bg-hover': `var(--vscode-list-hoverBackground, ${step(7)})`,
    '--mdxstudio-flow-chip-on-bg': `var(--vscode-badge-background, ${step(12)})`,
    '--mdxstudio-flow-chip-on-fg': 'var(--vscode-badge-foreground, var(--vscode-foreground))',
    '--mdxstudio-flow-tip-bg': SURFACE_RAISED,
    '--mdxstudio-flow-tip-border': BORDER_STRONG,
    '--mdxstudio-flow-tip-title-fg': FG,
    '--mdxstudio-flow-tip-meta-fg': ACCENT,
    '--mdxstudio-flow-tip-body-fg': FG,
    // SVG paint. These have to be opaque: they are `fill`/`stroke` values, and a
    // translucent node would show the band and the edges running under it.
    '--mdxstudio-flow-band-fill': step(4),
    '--mdxstudio-flow-band-stroke': BORDER,
    '--mdxstudio-flow-band-label': MUTED,
    '--mdxstudio-flow-node-fill': step(11),
    '--mdxstudio-flow-node-stroke': BORDER_STRONG,
    '--mdxstudio-flow-node-text': FG,
    '--mdxstudio-flow-node-meta': MUTED,
    '--mdxstudio-flow-edge': `var(--vscode-descriptionForeground, ${step(45)})`,
    '--mdxstudio-flow-edge-label': MUTED,
    '--mdxstudio-flow-edge-label-bg': step(4),
    '--mdxstudio-flow-accent-fallback': MUTED,
  };
}

/*
 * Fenced code blocks are deliberately left alone. `@mdxstudio/react` gives them
 * their own dark chrome in every theme it ships - the stylesheet says so in as
 * many words - and its Prism token colours are tuned for that dark background.
 * Repainting the block from `--vscode-editor-background` without also replacing
 * eight syntax colours (which VS Code does not expose as CSS custom properties;
 * `editor.tokenColorCustomizations` never reaches the DOM) would put bright
 * cyan and amber on white. So the code block stays as the package draws it.
 */

/** Reads the theme kind VS Code stamps on the webview document. */
export function readThemeKind(): VsCodeThemeKind {
  const stamped =
    document.body.dataset.vscodeThemeKind ??
    document.documentElement.dataset.vscodeThemeKind;
  if (isThemeKind(stamped)) return stamped;

  const classes = document.body.classList;
  if (classes.contains('vscode-high-contrast-light')) return 'vscode-high-contrast-light';
  if (classes.contains('vscode-high-contrast')) return 'vscode-high-contrast';
  if (classes.contains('vscode-light')) return 'vscode-light';
  return 'vscode-dark';
}

function isThemeKind(value: string | undefined): value is VsCodeThemeKind {
  return (
    value === 'vscode-light' ||
    value === 'vscode-dark' ||
    value === 'vscode-high-contrast' ||
    value === 'vscode-high-contrast-light'
  );
}

export function categoryOf(kind: VsCodeThemeKind): MdxThemeCategory {
  return kind === 'vscode-light' || kind === 'vscode-high-contrast-light' ? 'light' : 'dark';
}

/**
 * Builds the `ThemeConfig` for the current editor theme.
 *
 * The Tailwind class fields are inherited from the matching built-in preset:
 * `MdxRenderer` never reads them (only `category`, `previewBg`, `previewText`
 * and `cssVars` reach the DOM), but `ThemeConfig` requires them, and borrowing
 * a real preset's is more honest than filling them with empty strings.
 */
export function buildThemeConfig(kind: VsCodeThemeKind): ThemeConfig {
  const category = categoryOf(kind);
  const preset = category === 'light' ? THEMES['github-light'] : THEMES['github-dark'];

  return {
    ...preset,
    category,
    previewBg: PAGE,
    previewText: FG,
    cssVars: buildCssVars(),
  };
}

/**
 * Calls back whenever the user switches colour theme.
 *
 * VS Code rewrites the `--vscode-*` values in place, so most of the preview
 * retints without React doing anything - but `category` decides
 * `data-mdxstudio-theme`, which flips whole rule blocks, and it decides which
 * Mermaid theme diagrams are re-rendered with. Both need a real re-render.
 */
export function observeThemeKind(onChange: (kind: VsCodeThemeKind) => void): () => void {
  let current = readThemeKind();

  const check = () => {
    const next = readThemeKind();
    if (next === current) return;
    current = next;
    onChange(next);
  };

  const observer = new MutationObserver(check);
  const options: MutationObserverInit = {
    attributes: true,
    attributeFilter: ['class', 'data-vscode-theme-kind', 'data-vscode-theme-id', 'style'],
  };
  observer.observe(document.body, options);
  observer.observe(document.documentElement, options);

  return () => observer.disconnect();
}
