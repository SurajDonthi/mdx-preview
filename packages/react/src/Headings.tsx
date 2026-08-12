/**
 * Headings: a section a reader can collapse, and an anchor they can copy.
 *
 * The renderer emits a flat list - heading, paragraph, heading, list - so
 * "everything under this heading" is not a subtree that exists anywhere. It is
 * built here, by {@link groupHeadingSections}, as a transform on the hast tree
 * on the way to React rather than by walking the DOM afterwards. That way the
 * grouping is done once per parse instead of once per render, and the elements
 * React reconciles are already the ones a reader sees.
 *
 * The transform only ever *nests* nodes. It never reorders them, never copies
 * one and never touches a heading element itself, so `collectHeadings()` walks
 * the same headings in the same order it always did and the ids the table of
 * contents, the editor's scroll sync and the VS Code outline address are the
 * ones they were before.
 *
 * `h1` to `h3` open a section. `h4` to `h6` do not: a document uses those to
 * label a paragraph, not to start a chapter, and one that collapsed on its own
 * would leave the reader with a heading whose body had vanished for no visible
 * reason. They ride inside whichever section encloses them.
 */

import React, { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';

import { MdxRenderContext, collectHeadings } from '@mdxstudio/core';

// The names below are all in `BUILTIN_ICONS`, so they resolve synchronously and
// nothing here reaches the lazy import of the full lucide set.
import { DynamicIcon } from './icons';

/**
 * Tag name the transform gives a section.
 *
 * Hyphenated, so it can only ever come from this file: `hast-util-to-jsx-runtime`
 * resolves an element's tag name against the component map, and a document that
 * writes `<section>` itself still gets the plain HTML element.
 */
export const HEADING_SECTION_TAG = 'mdxstudio-section';

/** Deepest heading that opens a section of its own. */
const DEEPEST_SECTION_LEVEL = 3;

/** Where a heading's plain text is kept, for the copy control's label. */
const HEADING_TEXT_FIELD = 'mdxstudioHeadingText';

/** Where a section keeps what it needs to know about the heading that opened it. */
const SECTION_FIELD = 'mdxstudioSection';

interface HeadingSectionData {
  level: number;
  headingId: string;
  headingText: string;
}

/** Loose view of a hast node, enough to group a document's worth of them. */
interface LooseNode {
  type?: string;
  tagName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: LooseNode[];
  data?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * The transform
 * ------------------------------------------------------------------ */

/**
 * Stamps `id` on every heading in the tree, and remembers its text.
 *
 * The ids come from `collectHeadings()`, which is also what the table of
 * contents links to and what the scroll-spy reads back, so the two cannot
 * disagree about what a heading is called. The text is kept alongside because
 * the copy control names its heading out loud and the rendered children are the
 * wrong place to read that from - a heading may hold `code`, emphasis or math.
 */
export function assignHeadingIds(tree: unknown): void {
  for (const heading of collectHeadings(tree)) {
    const node = heading.node as LooseNode;
    node.properties = { ...(node.properties ?? {}), id: heading.id };
    node.data = { ...(node.data ?? {}), [HEADING_TEXT_FIELD]: heading.text };
  }
}

/** The level of a heading that opens a section, or null for anything else. */
function sectionLevel(node: LooseNode | undefined): number | null {
  if (!node || node.type !== 'element' || typeof node.tagName !== 'string') return null;
  if (!/^h[1-6]$/.test(node.tagName)) return null;
  const level = Number(node.tagName.slice(1));
  return level <= DEEPEST_SECTION_LEVEL ? level : null;
}

function headingTextOf(node: LooseNode | undefined): string {
  const text = node?.data?.[HEADING_TEXT_FIELD];
  return typeof text === 'string' ? text : '';
}

function sectionDataOf(node: LooseNode | undefined): HeadingSectionData | null {
  const data = node?.data?.[SECTION_FIELD];
  return data && typeof data === 'object' ? (data as HeadingSectionData) : null;
}

function makeSection(heading: LooseNode, level: number): LooseNode {
  const id = heading.properties?.id;

  return {
    type: 'element',
    tagName: HEADING_SECTION_TAG,
    properties: {},
    // The heading is the section's first child, and stays an ordinary `h1`/`h2`/
    // `h3` element with the id it already had.
    children: [heading],
    data: {
      [SECTION_FIELD]: {
        level,
        headingId: typeof id === 'string' ? id : '',
        headingText: headingTextOf(heading),
      } satisfies HeadingSectionData,
    },
  };
}

/**
 * Nests each top-level heading and everything under it into one section.
 *
 * A section runs from its heading to the next heading of the same level or a
 * shallower one, so a `##` closes an open `###` and a `#` closes both. Only the
 * document's own top-level blocks are grouped: a heading inside a component's
 * children belongs to that component, which decides for itself whether its
 * children are on the page at all.
 *
 * Idempotent, and it has to be: the parse cache hands one tree to the table of
 * contents, the renderer and the exporter alike. After a first pass no heading
 * is a top-level child any more, so a second pass finds nothing to group.
 */
export function groupHeadingSections(tree: unknown): void {
  const root = tree as LooseNode | null;
  if (!root || typeof root !== 'object' || !Array.isArray(root.children)) return;

  const grouped: LooseNode[] = [];
  /** Sections still open, outermost first. */
  const open: Array<{ level: number; section: LooseNode }> = [];

  const push = (node: LooseNode): void => {
    const innermost = open.length > 0 ? open[open.length - 1].section : null;
    (innermost?.children ?? grouped).push(node);
  };

  for (const child of root.children) {
    if (!child || typeof child !== 'object') continue;

    const level = sectionLevel(child);
    if (level === null) {
      // Anything before the first heading stays where it is, at the top level.
      push(child);
      continue;
    }

    while (open.length > 0 && open[open.length - 1].level >= level) open.pop();
    const section = makeSection(child, level);
    push(section);
    open.push({ level, section });
  }

  root.children = grouped;
}

/* ------------------------------------------------------------------ *
 * The clipboard
 * ------------------------------------------------------------------ */

/** Copies text, through whichever path this browser allows, and never throws. */
function copyText(text: string): void {
  try {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (clipboard && typeof clipboard.writeText === 'function') {
      void clipboard.writeText(text).catch(() => undefined);
      return;
    }
    // A webview without clipboard permission still has this one.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  } catch {
    // Losing a copy is a disappointment. Throwing here would lose the document.
  }
}

/**
 * What the copy control puts on the clipboard: the fragment, and nothing else.
 *
 * A full URL is what a hosted site copies, and it is the one thing that means
 * nothing in two of the three places this renderer runs - a `vscode-webview://`
 * address is dead the moment the panel closes, and a `http://localhost:4321`
 * one is dead on anyone else's machine. `#the-heading` is the form every host
 * already resolves: it is a link a document can paste as-is, and the prefix a
 * cross-document link is built from (`./other.mdx#the-heading`), which is
 * exactly what the VS Code extension's link handler splits on.
 */
function headingAnchorHref(id: string): string {
  return `#${id}`;
}

/* ------------------------------------------------------------------ *
 * The components
 * ------------------------------------------------------------------ */

interface HeadingSectionValue {
  /** The element the disclosure shows and hides. */
  panelId: string;
  expanded: boolean;
  toggle: () => void;
}

/**
 * Offered by a section to its own heading, and to nothing else.
 *
 * Only the heading element is wrapped in the provider, so a nested heading
 * inside the body reads its own section's value rather than its parent's.
 */
const HeadingSectionContext = React.createContext<HeadingSectionValue | null>(null);

/** True when nothing follows the heading but whitespace. */
function sectionIsEmpty(node: LooseNode | undefined): boolean {
  const children = node?.children;
  if (!Array.isArray(children)) return true;

  return !children
    .slice(1)
    .some((child) => child.type !== 'text' || String(child.value ?? '').trim() !== '');
}

export function MdxHeadingSection({ node, children }: { node?: LooseNode; children?: React.ReactNode }) {
  const { renderMode } = useContext(MdxRenderContext);
  // Nothing in an exported PDF can be opened, and every `button` is stripped
  // from it: a section that is shut there is a chapter deleted from the export.
  const isPdf = renderMode === 'pdf';

  const data = sectionDataOf(node);
  const headingId = data?.headingId ?? '';
  const uid = useId();
  const panelId = `${uid}-section`;

  const [collapsed, setCollapsed] = useState(false);
  // A document being edited rewrites this tree on every keystroke and React
  // matches sections by position, so a section that is now a different heading
  // starts open again rather than inheriting the state of whatever stood here.
  const lastHeadingId = useRef(headingId);
  if (lastHeadingId.current !== headingId) {
    lastHeadingId.current = headingId;
    setCollapsed(false);
  }

  const parts = React.Children.toArray(children);
  const heading = parts.length > 0 ? parts[0] : null;
  const body = parts.slice(1);

  // A heading with nothing under it gets no disclosure: a control that visibly
  // does nothing is worse than no control.
  const collapsible = !isPdf && !sectionIsEmpty(node);
  const expanded = !collapsible || !collapsed;

  const value = useMemo<HeadingSectionValue | null>(
    () =>
      collapsible
        ? { panelId, expanded, toggle: () => setCollapsed((shut) => !shut) }
        : null,
    [collapsible, panelId, expanded]
  );

  return (
    <section
      className="mdxstudio-section"
      data-mdxstudio-level={data?.level ?? undefined}
      data-collapsed={expanded ? undefined : 'true'}
    >
      <HeadingSectionContext.Provider value={value}>{heading}</HeadingSectionContext.Provider>
      <div id={panelId} className="mdxstudio-section__body" hidden={!expanded}>
        {/* Unmounted rather than merely hidden. A hidden heading is still found
            by `document.getElementById`, and a scroll-spy that measures one
            reads a zero offset and highlights the wrong entry for it. */}
        {expanded ? body : null}
      </div>
    </section>
  );
}

/** The disclosure, and the anchor. Rendered inside the heading, after its text. */
function HeadingControls({ id, text }: { id?: string; text: string }) {
  const section = useContext(HeadingSectionContext);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (!section && !id) return null;

  const named = text ? `"${text}"` : 'this section';
  const copyLabel = text ? `Copy link to "${text}"` : 'Copy link to this heading';

  return (
    <span className="mdxstudio-heading__controls">
      {section && (
        <button
          type="button"
          className="mdxstudio-heading__toggle"
          aria-expanded={section.expanded}
          aria-controls={section.panelId}
          aria-label={section.expanded ? `Collapse ${named}` : `Expand ${named}`}
          title={section.expanded ? 'Collapse section' : 'Expand section'}
          onClick={section.toggle}
        >
          <DynamicIcon
            name="ChevronDown"
            className={`mdxstudio-icon-14 mdxstudio-heading__chevron${
              section.expanded ? '' : ' mdxstudio-heading__chevron--shut'
            }`}
          />
        </button>
      )}
      {id && (
        <button
          type="button"
          className="mdxstudio-heading__anchor"
          aria-label={copyLabel}
          title={copyLabel}
          onClick={() => {
            copyText(headingAnchorHref(id));
            setCopied(true);
          }}
        >
          <DynamicIcon name={copied ? 'Check' : 'Copy'} className="mdxstudio-icon-14" />
        </button>
      )}
    </span>
  );
}

/**
 * The section wrapper, with the folding taken out.
 *
 * `collapsibleHeadings={false}` cannot simply skip {@link groupHeadingSections}:
 * the parse is memoised and one tree is handed to the renderer, the table of
 * contents and the exporter, so by the time a second consumer sees it the
 * sections are already there. Rendering them away is the only place the
 * decision can be made per consumer.
 *
 * It renders the children and nothing else - no `section`, no body wrapper and,
 * because it provides no context, no toggle. The heading keeps its anchor: that
 * is a separate control, and turning off folding is not a reason to stop a
 * reader linking to a heading.
 */
export function MdxHeadingSectionOpen({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

const HEADING_TAGS = ['h1', 'h2', 'h3'] as const;

/**
 * An `h1`, `h2` or `h3`, with its controls inside it.
 *
 * The heading stays a real heading with the id it was given: it is what the
 * table of contents scrolls to, what the scroll sync measures and what the
 * outline lists, and none of those would find a `button` wearing its name. The
 * controls carry no text either, so `textContent` is still the heading's own.
 */
function MdxHeading({ level, children, node, ...props }: any) {
  const { renderMode } = useContext(MdxRenderContext);
  const Tag = HEADING_TAGS[level - 1];
  const id = typeof props.id === 'string' ? props.id : undefined;

  return (
    <Tag className={`mdxstudio-heading mdxstudio-heading--${level}`} {...props}>
      {children}
      {renderMode !== 'pdf' && <HeadingControls id={id} text={headingTextOf(node)} />}
    </Tag>
  );
}

// Declared once, at module scope, so that rebuilding the element overrides -
// which a theme change does - hands React the same component types and the
// sections keep their state instead of remounting shut-or-open at random.
export const MdxH1 = (props: any) => <MdxHeading level={1} {...props} />;
export const MdxH2 = (props: any) => <MdxHeading level={2} {...props} />;
export const MdxH3 = (props: any) => <MdxHeading level={3} {...props} />;
