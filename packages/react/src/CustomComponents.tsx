import React, { useContext, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  GripHorizontal,
  GripVertical,
  Minus,
  Plus,
  RotateCcw,
  Table,
} from 'lucide-react';
import { MdxRenderContext } from '@mdxstudio/core';
import { InlineToken } from './InlineToken';
// A document names its icons at runtime (`<Card icon="Eye">`), which no set of
// named imports can satisfy on its own. See `./icons` for how that is served
// without pulling the whole lucide set into the first load.
import { DynamicIcon } from './icons';
// `$x$` and `$$x$$` are rewritten to this tag by the parser, so it has to be in
// the same map every other built-in is in. KaTeX itself is not: the component
// loads it on demand.
import { MathExpression } from './MathExpression';

// 1. Callout / Alert Box
export interface CalloutProps {
  type?: 'info' | 'warning' | 'success' | 'error' | 'note';
  title?: string;
  children?: React.ReactNode;
}

const CALLOUT_ICONS: Record<string, string> = {
  info: 'Info',
  warning: 'AlertTriangle',
  success: 'CheckCircle2',
  error: 'OctagonAlert',
  note: 'Sparkles',
};

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const variant = CALLOUT_ICONS[type] ? type : 'info';

  return (
    <div className={`mdxstudio-callout mdxstudio-callout--${variant}`}>
      <div className="mdxstudio-callout__row">
        <div className="mdxstudio-callout__icon">
          <DynamicIcon name={CALLOUT_ICONS[variant]} className="mdxstudio-icon-20" />
        </div>
        <div className="mdxstudio-callout__content">
          {title && <div className="mdxstudio-callout__title">{title}</div>}
          <div>{children}</div>
        </div>
      </div>
    </div>
  );
}

// 2. Card & CardGrid
export interface CardProps {
  title: string;
  description?: string;
  subtitle?: string;
  icon?: string;
  badge?: string;
  children?: React.ReactNode;
  href?: string;
}

export function Card({ title, description, subtitle, icon, badge, children, href }: CardProps) {
  const content = (
    <div className="mdxstudio-card">
      <div className="mdxstudio-card__head">
        <div className="mdxstudio-card__identity">
          {icon && (
            <div className="mdxstudio-card__icon">
              <DynamicIcon name={icon} className="mdxstudio-icon-20" />
            </div>
          )}
          <div>
            <h4 className="mdxstudio-card__title">{title}</h4>
            {subtitle && <p className="mdxstudio-card__subtitle">{subtitle}</p>}
          </div>
        </div>
        {badge && <span className="mdxstudio-card__badge">{badge}</span>}
      </div>
      {description && <p className="mdxstudio-card__description">{description}</p>}
      {children && <div className="mdxstudio-card__body">{children}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="mdxstudio-card-link">
        {content}
      </a>
    );
  }

  return content;
}

export function CardGrid({
  cols = 2,
  children,
}: {
  cols?: number;
  children?: React.ReactNode;
}) {
  const columns = cols === 3 ? 3 : cols === 4 ? 4 : 2;

  return <div className={`mdxstudio-card-grid mdxstudio-card-grid--${columns}`}>{children}</div>;
}

// 3. Stat Card & Grid
export interface StatProps {
  title: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: string;
}

export function Stat({ title, value, change, trend = 'up', icon }: StatProps) {
  const direction = trend === 'down' ? 'down' : trend === 'neutral' ? 'neutral' : 'up';

  return (
    <div className="mdxstudio-stat">
      <div className="mdxstudio-stat__head">
        <span>{title}</span>
        {icon && <DynamicIcon name={icon} className="mdxstudio-icon-16 mdxstudio-stat__icon" />}
      </div>
      <div className="mdxstudio-stat__row">
        <span className="mdxstudio-stat__value">{value}</span>
        {change && (
          <span className={`mdxstudio-stat__change mdxstudio-stat__change--${direction}`}>{change}</span>
        )}
      </div>
    </div>
  );
}

export function StatGrid({
  cols = 3,
  children,
}: {
  cols?: number;
  children?: React.ReactNode;
}) {
  const columns = cols === 2 ? 2 : cols === 4 ? 4 : 3;

  return <div className={`mdxstudio-stat-grid mdxstudio-stat-grid--${columns}`}>{children}</div>;
}

// 4. Tabs & Tab
export function Tabs({
  labels = [],
  children,
}: {
  labels?: string[];
  children?: React.ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const childArray = React.Children.toArray(children);
  const tabLabels =
    labels.length > 0
      ? labels
      : childArray.map((child: any) => child.props?.title || child.props?.label || `Tab`);

  return (
    <div className="mdxstudio-tabs">
      <div className="mdxstudio-tabs__list">
        {tabLabels.map((label, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`mdxstudio-tabs__tab${activeIndex === idx ? ' mdxstudio-tabs__tab--active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mdxstudio-tabs__panel">{childArray[activeIndex] || childArray}</div>
    </div>
  );
}

export function Tab({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div title={title}>{children}</div>;
}

// 5. Accordion & AccordionItem
//
// Two shapes, because the prop form shipped first.
//
//   <Accordion>
//   <AccordionItem title="Why?">
//
//   Any markdown at all - lists, fences, other components.
//
//   </AccordionItem>
//   </Accordion>
//
// A panel written as a child goes through the MDX pipeline like anything else,
// which is the only way markdown can appear inside one. `items={[...]}` still
// renders when no child declares a panel, so a document written against 0.2.3
// keeps working.

/**
 * One panel of the `items={[...]}` form.
 *
 * `content` is a prop: a string or a node the document builds inline. Markdown
 * written there stays literal - use `<AccordionItem>` children for markdown.
 */
export interface AccordionItem {
  title?: React.ReactNode;
  content?: React.ReactNode;
  /** lucide icon name, as `Card` and `Callout` take. */
  icon?: string;
  subtitle?: string;
  badge?: string;
  /** Opens this panel on load, unless the accordion names its own `defaultOpen`. */
  defaultOpen?: boolean;
}

/** A panel written as a child of `<Accordion>`. */
export interface AccordionItemProps extends Omit<AccordionItem, 'content'> {
  children?: React.ReactNode;
}

/**
 * What starts open. An index, a title, `"all"`, `"none"`, or a list of those;
 * a bare `defaultOpen` means every panel, `defaultOpen={false}` means none.
 */
export type AccordionOpen = boolean | number | string | Array<number | string>;

export interface AccordionProps {
  /** Panels. Prefer `<AccordionItem>` children; this is the 0.2.3 form. */
  items?: AccordionItem[];
  /** Lets more than one panel be open at a time. */
  multiple?: boolean;
  defaultOpen?: AccordionOpen;
  children?: React.ReactNode;
}

/** What a browser calls a `<summary>` with nothing in it. */
const ACCORDION_FALLBACK_TITLE = 'Details';

const ACCORDION_ALL = new Set(['all', 'true', 'open']);
const ACCORDION_NONE = new Set(['none', 'closed', 'false']);

interface AccordionEntry {
  /** What the trigger shows. */
  title: React.ReactNode;
  /** The same thing as plain text, so `defaultOpen="Some title"` can match it. */
  label: string;
  icon?: string;
  subtitle?: string;
  badge?: string;
  defaultOpen: boolean;
  content: React.ReactNode;
}

type AccordionSlot =
  | { kind: 'panel'; entry: AccordionEntry; index: number }
  | { kind: 'stray'; node: React.ReactNode };

function accordionText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function accordionFlag(value: unknown): boolean {
  // A bare MDX attribute (`<AccordionItem defaultOpen>`) arrives as `true`;
  // `defaultOpen="true"` arrives as the string.
  return value === true || value === 'true' || value === '';
}

/** Reads a panel out of either an `<AccordionItem>`'s props or an `items[]` entry. */
function accordionEntry(source: Record<string, unknown> | AccordionItem): AccordionEntry {
  const props = (source ?? {}) as Record<string, unknown>;
  const label = accordionText(props.title).trim();
  const content = 'children' in props ? props.children : props.content;
  // A title is what names the trigger, so a panel that did not give one still
  // gets something a screen reader can announce.
  const named = label !== '' || React.isValidElement(props.title);

  return {
    title: named ? (props.title as React.ReactNode) : ACCORDION_FALLBACK_TITLE,
    label: label || ACCORDION_FALLBACK_TITLE,
    icon: typeof props.icon === 'string' ? props.icon : undefined,
    subtitle: accordionText(props.subtitle) || undefined,
    badge: accordionText(props.badge) || undefined,
    defaultOpen: accordionFlag(props.defaultOpen),
    content: (content ?? null) as React.ReactNode,
  };
}

/**
 * Whether a child declares a panel.
 *
 * `AccordionItem` itself, or - as `Tabs` already does with `title` - any
 * component-typed child that names one, so a host's own wrapper still lands in
 * the right place instead of being dropped.
 */
function isAccordionPanel(child: React.ReactElement): boolean {
  if (child.type === AccordionItem) return true;
  if (typeof child.type === 'string') return false;
  const props = child.props as Record<string, unknown> | null;
  return Boolean(props && ('title' in props || 'content' in props));
}

/** Whether a wrapper the parser inserted has panels inside it. */
function holdsAccordionPanels(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && isAccordionPanel(child)
  );
}

/** Splits children into panels and whatever else the document put there. */
function accordionSlots(children: React.ReactNode, items?: AccordionItem[]): AccordionSlot[] {
  const slots: AccordionSlot[] = [];
  let panels = 0;

  const walk = (nodes: React.ReactNode) => {
    for (const child of React.Children.toArray(nodes)) {
      if (typeof child === 'string') {
        // Whitespace between JSX children is not content.
        if (child.trim()) slots.push({ kind: 'stray', node: child });
        continue;
      }

      if (React.isValidElement(child)) {
        if (isAccordionPanel(child)) {
          slots.push({ kind: 'panel', entry: accordionEntry(child.props as never), index: panels });
          panels += 1;
          continue;
        }

        // Panels written without a blank line between them are one markdown
        // paragraph as far as the parser is concerned, and arrive wrapped in
        // it. Lift them out: a document that reads like an accordion should be
        // one, rather than a row of one-panel accordions inside a paragraph.
        const inner = (child.props as { children?: React.ReactNode } | null)?.children;
        if (holdsAccordionPanels(inner)) {
          walk(inner);
          continue;
        }
      }

      slots.push({ kind: 'stray', node: child });
    }
  };

  walk(children);

  if (panels > 0 || !Array.isArray(items)) return slots;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    slots.push({ kind: 'panel', entry: accordionEntry(item), index: panels });
    panels += 1;
  }

  return slots;
}

/** Resolves one token of `defaultOpen` to the panels it names. */
function accordionIndices(entries: AccordionEntry[], token: unknown): number[] {
  const all = () => entries.map((_, index) => index);

  if (typeof token === 'boolean') return token ? all() : [];
  if (typeof token === 'number') {
    return Number.isInteger(token) && token >= 0 && token < entries.length ? [token] : [];
  }
  if (typeof token !== 'string') return [];

  const text = token.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  if (ACCORDION_ALL.has(lower)) return all();
  if (ACCORDION_NONE.has(lower)) return [];
  if (/^\d+$/.test(text)) {
    const index = Number(text);
    return index < entries.length ? [index] : [];
  }

  const match = entries.findIndex((entry) => entry.label.trim().toLowerCase() === lower);
  return match === -1 ? [] : [match];
}

/**
 * The panels open on load.
 *
 * The accordion's own `defaultOpen` decides on its own when it is given; failing
 * that, the panels that asked; failing that the first one, which is what the
 * component has always done and what keeps an accordion from arriving as a
 * stack of shut bars with nothing to read.
 */
function accordionInitialOpen(
  entries: AccordionEntry[],
  defaultOpen: AccordionOpen | undefined,
  multiple: boolean
): Set<number> {
  let open: Set<number>;

  if (defaultOpen === undefined || defaultOpen === null) {
    const asked = entries.flatMap((entry, index) => (entry.defaultOpen ? [index] : []));
    open = new Set(asked.length > 0 ? asked : entries.length > 0 ? [0] : []);
  } else {
    const tokens = Array.isArray(defaultOpen) ? defaultOpen : [defaultOpen];
    open = new Set(tokens.flatMap((token) => accordionIndices(entries, token)));
  }

  // One panel at a time is a promise the initial state has to keep too.
  if (!multiple && open.size > 1) return new Set([Math.min(...open)]);
  return open;
}

export function Accordion({ items, multiple = false, defaultOpen, children }: AccordionProps) {
  const { renderMode } = useContext(MdxRenderContext);
  // Nothing in an exported PDF can be opened, and every `button` is stripped
  // from it: a collapsed panel there is content deleted from the document.
  const isPdf = renderMode === 'pdf';

  const uid = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const slots = useMemo(() => accordionSlots(children, items), [children, items]);
  const entries = useMemo(
    () => slots.flatMap((slot) => (slot.kind === 'panel' ? [slot.entry] : [])),
    [slots]
  );

  // Keyed by index, and re-resolved when the panels themselves change - a
  // document being edited rewrites this tree on every keystroke.
  const [open, setOpen] = useState<Set<number>>(() =>
    accordionInitialOpen(entries, defaultOpen, multiple)
  );
  const signature = entries.map((entry) => entry.label).join('\n');
  const lastSignature = useRef(signature);
  if (lastSignature.current !== signature) {
    lastSignature.current = signature;
    setOpen(accordionInitialOpen(entries, defaultOpen, multiple));
  }

  const toggle = (index: number) => {
    setOpen((current) => {
      if (current.has(index)) {
        const next = new Set(multiple ? current : []);
        next.delete(index);
        return next;
      }
      const next = multiple ? new Set(current) : new Set<number>();
      next.add(index);
      return next;
    });
  };

  /** Up/Down/Home/End across the triggers, as the disclosure pattern asks. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (key !== 'ArrowDown' && key !== 'ArrowUp' && key !== 'Home' && key !== 'End') return;

    const root = rootRef.current;
    if (!root) return;
    // A nested accordion has triggers of its own; only this one's count.
    const triggers = Array.from(
      root.querySelectorAll<HTMLButtonElement>('button.mdxstudio-accordion__trigger')
    ).filter((trigger) => trigger.closest('.mdxstudio-accordion') === root);
    if (triggers.length === 0) return;

    event.preventDefault();
    const from = triggers.indexOf(event.currentTarget);
    const to =
      key === 'Home'
        ? 0
        : key === 'End'
          ? triggers.length - 1
          : (Math.max(0, from) + (key === 'ArrowDown' ? 1 : -1) + triggers.length) % triggers.length;
    triggers[to]?.focus();
  };

  if (slots.length === 0) return null;

  return (
    <div className="mdxstudio-accordion" ref={rootRef}>
      {slots.map((slot, slotIndex) => {
        if (slot.kind === 'stray') {
          // Not a panel, but not something to swallow either.
          return (
            <div key={`stray-${slotIndex}`} className="mdxstudio-accordion__loose">
              {slot.node}
            </div>
          );
        }

        const { entry, index } = slot;
        const isOpen = isPdf || open.has(index);
        const triggerId = `${uid}-trigger-${index}`;
        const panelId = `${uid}-panel-${index}`;

        const label = (
          <span className="mdxstudio-accordion__label">
            {entry.icon && (
              <span className="mdxstudio-accordion__icon">
                <DynamicIcon name={entry.icon} className="mdxstudio-icon-20" />
              </span>
            )}
            <span>
              <span className="mdxstudio-accordion__title">{entry.title}</span>
              {entry.subtitle && (
                <span className="mdxstudio-accordion__subtitle">{entry.subtitle}</span>
              )}
            </span>
          </span>
        );

        return (
          <div key={`panel-${index}`} className="mdxstudio-accordion__item">
            {isPdf ? (
              <div
                id={triggerId}
                className="mdxstudio-accordion__trigger mdxstudio-accordion__trigger--static"
              >
                {label}
                {entry.badge && <span className="mdxstudio-accordion__badge">{entry.badge}</span>}
              </div>
            ) : (
              <button
                type="button"
                id={triggerId}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                onKeyDown={onKeyDown}
                className="mdxstudio-accordion__trigger"
              >
                {label}
                <span className="mdxstudio-accordion__aside">
                  {entry.badge && <span className="mdxstudio-accordion__badge">{entry.badge}</span>}
                  <ChevronDown
                    className={`mdxstudio-icon-16 mdxstudio-accordion__chevron${
                      isOpen ? ' mdxstudio-accordion__chevron--open' : ''
                    }`}
                  />
                </span>
              </button>
            )}
            {/* Mounted whether or not it is open, so `aria-controls` always
                resolves and a component inside keeps its state across a close. */}
            <div
              id={panelId}
              role="region"
              aria-labelledby={triggerId}
              hidden={!isOpen}
              className="mdxstudio-accordion__panel"
            >
              {entry.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A panel. Read by `<Accordion>` from its props rather than mounted, the way
 * `<Tab>` is; on its own it is a one-panel accordion rather than nothing.
 */
export function AccordionItem({ children, ...rest }: AccordionItemProps) {
  return <Accordion items={[{ ...rest, content: children }]} />;
}

// 6. Interactive Counter
export function InteractiveCounter({
  initial = 0,
  min = 0,
  max = 100,
  step = 1,
  title = 'Interactive Counter Component',
}: {
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  title?: string;
}) {
  const [count, setCount] = useState(initial);

  return (
    <div className="mdxstudio-counter">
      <div>
        <h5 className="mdxstudio-counter__title">{title}</h5>
        <p className="mdxstudio-counter__range">
          Range: {min} to {max} | Step: {step}
        </p>
      </div>
      <div className="mdxstudio-counter__controls">
        <button
          onClick={() => setCount(Math.max(min, count - step))}
          disabled={count <= min}
          className="mdxstudio-counter__button"
        >
          <Minus className="mdxstudio-icon-16" />
        </button>
        <span className="mdxstudio-counter__value">{count}</span>
        <button
          onClick={() => setCount(Math.min(max, count + step))}
          disabled={count >= max}
          className="mdxstudio-counter__button"
        >
          <Plus className="mdxstudio-icon-16" />
        </button>
        <button onClick={() => setCount(initial)} title="Reset" className="mdxstudio-counter__reset">
          <RotateCcw className="mdxstudio-icon-14" />
        </button>
      </div>
    </div>
  );
}

// 7. Progress Bar
//
// The track and the fill are nothing but a background colour, and the PDF
// exporter clears every background on its capture sheet before putting back only
// the ones an element names through `data-pdf-swatch`. Without that attribute
// both bars vanish from the export and the label is all that survives. The
// values below mirror the tones in styles.css: a stylesheet cannot be read from
// here, and the sheet's own oklch() is not what the export pass writes back.
const PROGRESS_COLORS: Record<string, string> = {
  indigo: '#4f46e5',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  purple: '#9333ea',
  cyan: '#06b6d4',
};

/** Slate-200, the light-theme track the export sheet is styled for. */
const PROGRESS_TRACK_PDF = '#e2e8f0';

export function ProgressBar({
  progress = 50,
  label,
  color = 'indigo',
}: {
  progress?: number;
  label?: string;
  color?: string;
}) {
  const { renderMode } = useContext(MdxRenderContext);
  const isPdf = renderMode === 'pdf';
  const tone = Object.hasOwn(PROGRESS_COLORS, color) ? color : 'indigo';

  return (
    <div className="mdxstudio-progress">
      {(label || progress !== undefined) && (
        <div className="mdxstudio-progress__labels">
          <span>{label}</span>
          <span>{progress}%</span>
        </div>
      )}
      <div
        className="mdxstudio-progress__track"
        data-pdf-swatch={isPdf ? PROGRESS_TRACK_PDF : undefined}
      >
        <div
          className={`mdxstudio-progress__fill mdxstudio-progress__fill--${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          data-pdf-swatch={isPdf ? PROGRESS_COLORS[tone] : undefined}
        />
      </div>
    </div>
  );
}

// 9. Timeline & Steps
export interface TimelineItem {
  date: string;
  title: string;
  description: string;
  icon?: string;
}

export function Timeline({ items = [] }: { items?: TimelineItem[] }) {
  return (
    <div className="mdxstudio-timeline">
      {items.map((item, idx) => (
        <div key={idx} className="mdxstudio-timeline__item">
          <div className="mdxstudio-timeline__marker">
            <DynamicIcon name={item.icon || 'CircleDot'} className="mdxstudio-icon-14" />
          </div>
          <div className="mdxstudio-timeline__date">{item.date}</div>
          <h5 className="mdxstudio-timeline__title">{item.title}</h5>
          <p className="mdxstudio-timeline__description">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({ children }: { children?: React.ReactNode }) {
  return <div className="mdxstudio-steps">{children}</div>;
}

export function Step({
  number,
  title,
  children,
}: {
  number?: number | string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mdxstudio-step">
      <div className="mdxstudio-step__number">{number}</div>
      <div>
        <h5 className="mdxstudio-step__title">{title}</h5>
        <div className="mdxstudio-step__body">{children}</div>
      </div>
    </div>
  );
}

// 10. Kbd & Badge & InlineCode
export function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <InlineToken as="code" kind="code">
      {children}
    </InlineToken>
  );
}

export function Kbd({ children }: { children?: React.ReactNode }) {
  return <kbd className="mdxstudio-kbd">{children}</kbd>;
}

const BADGE_VARIANTS = new Set(['indigo', 'emerald', 'rose', 'amber', 'slate']);

export function Badge({
  variant = 'indigo',
  icon,
  children,
}: {
  variant?: string;
  icon?: string;
  children?: React.ReactNode;
}) {
  const tone = BADGE_VARIANTS.has(variant) ? variant : 'indigo';

  return (
    <span className={`mdxstudio-badge mdxstudio-badge--${tone}`}>
      {icon && <DynamicIcon name={icon} className="mdxstudio-icon-14" />}
      {children}
    </span>
  );
}

export function Button({
  variant = 'primary',
  icon,
  children,
  onClick,
}: {
  variant?: 'primary' | 'secondary' | 'outline';
  icon?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  const [clicked, setClicked] = useState(false);

  const handleClick = () => {
    setClicked(true);
    setTimeout(() => setClicked(false), 1500);
    if (onClick) onClick();
  };

  const tone = variant === 'secondary' || variant === 'outline' ? variant : 'primary';

  return (
    <button onClick={handleClick} className={`mdxstudio-button mdxstudio-button--${tone}`}>
      {icon && <DynamicIcon name={icon} className="mdxstudio-icon-16" />}
      {children}
      {clicked && <Check className="mdxstudio-icon-16 mdxstudio-button__done" />}
    </button>
  );
}

export function TableComponent({
  headers = [],
  data = [],
  rows = [],
  title,
  striped = true,
}: {
  headers?: string[];
  data?: any[];
  rows?: any[][];
  title?: string;
  striped?: boolean;
}) {
  const effectiveRows: any[][] = rows.length > 0 ? rows : (Array.isArray(data) && Array.isArray(data[0]) ? data : []);

  return (
    <div className="mdxstudio-datatable">
      {title && (
        <div className="mdxstudio-datatable__caption">
          <Table className="mdxstudio-icon-16 mdxstudio-datatable__caption-icon" />
          <span>{title}</span>
        </div>
      )}
      <div className="mdxstudio-datatable__scroll">
        <table className="mdxstudio-table">
          {headers.length > 0 && (
            <thead className="mdxstudio-thead">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="mdxstudio-datatable__th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="mdxstudio-tbody">
            {effectiveRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={`mdxstudio-tr${
                  striped && rIdx % 2 === 1 ? ' mdxstudio-datatable__row--striped' : ''
                }`}
              >
                {row.map((cell: any, cIdx: number) => (
                  <td key={cIdx} className="mdxstudio-datatable__td">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 11. Split & Pane
//
// Two things on the page at once, which is the one thing `Tabs` cannot do: a
// tab shows one variant at a time, and a comparison is only a comparison when
// both variants are in front of the reader together.
//
//   <Split ratio="60/40">
//
//   <Pane title="Before" icon="Ban">
//
//   ```ts
//   const x = 1;
//   ```
//
//   </Pane>
//
//   <Pane title="After" icon="Check" badge="Typed">
//
//   ```ts
//   const x: number = 1;
//   ```
//
//   </Pane>
//
//   </Split>
//
// Content is children, never a prop. A pane goes through the MDX pipeline like
// anything else, so a fence is a fence, a list is a list and a diagram is a
// diagram - which is exactly what a comparison is usually made of.
//
// On `direction`. "Horizontal split" names the divider to some people and the
// arrangement of the panes to others, and both readings are in common use, so
// the word is avoided entirely: `direction` takes `row` and `column`, the CSS
// `flex-direction` vocabulary, and describes *the panes*. `row` puts them beside
// each other, `column` stacks them. The divider then lies across the other axis
// by definition, and that axis is spelled out separately, in the one place it is
// actually load-bearing: the separator's `aria-orientation`, which is `vertical`
// for a row of panes and `horizontal` for a column of them.

/** How the panes are arranged. Not how the divider lies - see above. */
export type SplitDirection = 'row' | 'column';

/**
 * The initial share of each pane. A list of weights (`"2:1"`, `"60 40"`,
 * `[3, 1]`), or a single number, which is the first pane's percentage.
 */
export type SplitRatio = number | string | Array<number | string>;

export interface PaneProps {
  /** A small header above the pane. */
  title?: React.ReactNode;
  /** lucide icon name, as `Card` and `Callout` take. */
  icon?: string;
  badge?: string;
  children?: React.ReactNode;
}

export interface SplitProps {
  direction?: SplitDirection | string;
  /** Where the split starts. Dragging moves it for the session only. */
  ratio?: SplitRatio;
  /**
   * How tall the split is. A column split needs a height for its divider to
   * have anything to move and takes {@link SPLIT_COLUMN_HEIGHT} without one; a
   * row split grows with its content unless a height is given. Either way the
   * panes scroll rather than clip, and the export ignores it.
   */
  height?: number | string;
  children?: React.ReactNode;
}

/** The narrowest a pane can be, as a percentage of the split. */
const SPLIT_MIN_SHARE = 10;

/** Arrow-key steps, the same pair the Studio's own split view uses. */
const SPLIT_STEP = 2;
const SPLIT_STEP_LARGE = 10;

/** What a column split is tall by default, having no content to be sized by. */
const SPLIT_COLUMN_HEIGHT = '24rem';

/** The gutter a divider stands in, mirroring `--mdxstudio-space-3` in the sheet. */
const SPLIT_GUTTER_PX = 12;

/**
 * How wide a split is on the PDF capture sheet. `PAPER_WIDTH_PX` in
 * `@mdxstudio/pdf` is 794, the sheet is padded by 32 either side and the
 * renderer insets its prose by another 40, which leaves this. Measured off a
 * real capture rather than reasoned about, and mirrored as a number because the
 * export does not run a media query against the sheet: the capture happens in
 * whatever window the reader has open, so a viewport query would make an A4
 * page depend on the size of a browser nobody is looking at.
 */
const PDF_SHEET_CONTENT_PX = 650;

/**
 * The narrowest a pane may be on that sheet and still be worth printing.
 *
 * 240px, less the pane's own padding and the code block's, leaves about 24
 * characters of the 12px monospace the export sets - which the short lines a
 * before-and-after comparison is made of still fit on. Below that everything
 * wraps and the columns stop being comparable at all.
 *
 * Two panes clear it down to 60/40 and print side by side, which is what the
 * comparison was for. Three do not (209px each), nor does anything more
 * lopsided, and those are stacked instead, each under its own title: a
 * comparison the reader has to scroll is worth more than one they cannot read.
 */
const PDF_MIN_PANE_PX = 240;

interface SplitPaneEntry {
  title: React.ReactNode;
  /** The title as plain text, for the divider's label. */
  label: string;
  icon?: string;
  badge?: string;
  content: React.ReactNode;
}

function splitText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

/** Reads a pane out of a `<Pane>`'s props. */
function splitPaneEntry(source: Record<string, unknown>): SplitPaneEntry {
  const props = source ?? {};
  const label = splitText(props.title).trim();

  return {
    title: label !== '' || React.isValidElement(props.title) ? (props.title as React.ReactNode) : null,
    label,
    icon: typeof props.icon === 'string' ? props.icon : undefined,
    badge: splitText(props.badge) || undefined,
    content: (props.children ?? null) as React.ReactNode,
  };
}

/** A child with no pane to read: its content is the whole of it. */
function splitLooseEntry(node: React.ReactNode): SplitPaneEntry {
  return { title: null, label: '', content: node };
}

/**
 * Whether a child declares a pane.
 *
 * `Pane` itself, or - as `Tabs` and `Accordion` already do - any
 * component-typed child that names a `title`, so a host's own wrapper is placed
 * rather than swallowed.
 */
function isSplitPane(child: React.ReactElement): boolean {
  if (child.type === Pane) return true;
  if (typeof child.type === 'string') return false;
  const props = child.props as Record<string, unknown> | null;
  return Boolean(props && 'title' in props);
}

/** Whether a wrapper the parser inserted has panes inside it. */
function holdsSplitPanes(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && isSplitPane(child)
  );
}

/**
 * The panes of a split.
 *
 * Anything that is not a `Pane` becomes a pane of its own rather than being
 * dropped or pushed out of the layout: a column with no title still shows what
 * the document put there, which is the least surprising thing a comparison can
 * do with a child it did not expect.
 */
function splitPanes(children: React.ReactNode): SplitPaneEntry[] {
  const entries: SplitPaneEntry[] = [];

  const walk = (nodes: React.ReactNode) => {
    for (const child of React.Children.toArray(nodes)) {
      if (typeof child === 'string') {
        // Whitespace between JSX children is not content.
        if (child.trim()) entries.push(splitLooseEntry(child));
        continue;
      }

      if (React.isValidElement(child)) {
        if (isSplitPane(child)) {
          entries.push(splitPaneEntry(child.props as never));
          continue;
        }

        // Panes written without a blank line between them are one markdown
        // paragraph as far as the parser is concerned, and arrive wrapped in it.
        if (holdsSplitPanes((child.props as { children?: React.ReactNode } | null)?.children)) {
          walk((child.props as { children?: React.ReactNode }).children);
          continue;
        }
      }

      entries.push(splitLooseEntry(child));
    }
  };

  walk(children);
  return entries;
}

/** Raises anything under the minimum, taking the difference from the rest. */
function liftSplitShares(shares: number[]): number[] {
  const equal = () => new Array(shares.length).fill(100 / shares.length);
  if (shares.length * SPLIT_MIN_SHARE >= 100) return equal();

  let next = shares.slice();
  // One pass per pane at worst: each pass pins at least one pane to the floor.
  for (let pass = 0; pass < shares.length; pass += 1) {
    const deficit = next.reduce((sum, share) => sum + Math.max(0, SPLIT_MIN_SHARE - share), 0);
    if (deficit < 1e-9) break;
    const surplus = next.reduce((sum, share) => sum + Math.max(0, share - SPLIT_MIN_SHARE), 0);
    if (surplus < 1e-9) return equal();
    next = next.map((share) =>
      share <= SPLIT_MIN_SHARE
        ? SPLIT_MIN_SHARE
        : share - ((share - SPLIT_MIN_SHARE) / surplus) * deficit
    );
  }

  return next;
}

/**
 * Reads `ratio` into one percentage per pane, summing to 100.
 *
 * Every unusable form lands on equal panes rather than throwing: an author who
 * mistypes a ratio should see the comparison, not an error.
 */
export function normaliseSplitShares(ratio: SplitRatio | undefined, count: number): number[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  if (count === 1) return [100];

  const equal = () => new Array(count).fill(100 / count);

  const tokens: unknown[] = Array.isArray(ratio)
    ? ratio
    : typeof ratio === 'string'
      ? ratio.split(/[\s,:/|]+/)
      : ratio === undefined || ratio === null
        ? []
        : [ratio];

  const weights = tokens
    .map((token) => (typeof token === 'number' ? token : Number(String(token).trim())))
    .filter((weight) => Number.isFinite(weight) && weight > 0);

  if (weights.length === 0) return equal();

  // One weight for several panes reads as a percentage - `ratio={70}` is the
  // familiar way of saying "seventy-thirty" - and the rest share what is left.
  if (weights.length === 1) {
    const first = weights[0];
    if (first >= 100) return liftSplitShares([first, ...new Array(count - 1).fill(0)]);
    return liftSplitShares([first, ...new Array(count - 1).fill((100 - first) / (count - 1))]);
  }

  // Fewer weights than panes is a document that changed under its ratio. The
  // panes it forgot get the average of the ones it named.
  const mean = weights.reduce((sum, weight) => sum + weight, 0) / weights.length;
  const padded = weights.slice(0, count);
  while (padded.length < count) padded.push(mean);

  const total = padded.reduce((sum, weight) => sum + weight, 0);
  return liftSplitShares(padded.map((weight) => (weight / total) * 100));
}

/** Where the boundary after pane `index` sits, as a percentage of the split. */
export function splitBoundaryPosition(shares: number[], index: number): number {
  return shares.slice(0, index + 1).reduce((sum, share) => sum + share, 0);
}

/**
 * Puts that boundary at `position`.
 *
 * Only the two panes the boundary separates change, so dragging one divider of
 * a three-pane split leaves the third alone - the same contract every split
 * view has.
 */
export function moveSplitBoundary(shares: number[], index: number, position: number): number[] {
  if (index < 0 || index + 1 >= shares.length || !Number.isFinite(position)) return shares;

  const before = shares.slice(0, index).reduce((sum, share) => sum + share, 0);
  const pair = shares[index] + shares[index + 1];
  const first = Math.min(
    Math.max(position - before, SPLIT_MIN_SHARE),
    Math.max(pair - SPLIT_MIN_SHARE, SPLIT_MIN_SHARE)
  );

  const next = shares.slice();
  next[index] = first;
  next[index + 1] = pair - first;
  return next;
}

/**
 * Where the pointer puts a boundary, as a percentage of the space the panes
 * actually share - which is the track less the dividers standing in it. Null
 * when there is no such space, which is what a track that is not laid out yet
 * looks like.
 */
export function splitPointerPosition(measurements: {
  /** `clientX` for a row of panes, `clientY` for a column. */
  point: number;
  /** The track's left edge, or its top. */
  start: number;
  /** The track's width, or its height. */
  extent: number;
  /** One divider's width, or its height. */
  dividerSize: number;
  /** How many dividers the track has. */
  dividers: number;
  /** How many of them lie before this boundary. */
  before: number;
}): number | null {
  const { point, start, extent, dividerSize, dividers, before } = measurements;
  const content = extent - dividerSize * dividers;
  if (!(content > 0)) return null;
  return ((point - start - dividerSize * before) / content) * 100;
}

/** The height the track is given, or null when it grows with its content. */
function splitHeight(height: unknown, axis: SplitDirection): string | null {
  if (typeof height === 'number') {
    return Number.isFinite(height) && height > 0 ? `${height}px` : null;
  }
  if (typeof height === 'string') {
    const text = height.trim();
    if (text && text !== 'auto') return text;
    if (text === 'auto') return null;
  }
  return axis === 'column' ? SPLIT_COLUMN_HEIGHT : null;
}

/**
 * A pane's share, as a custom property rather than an inline `flex-grow`.
 *
 * The share is data; which axis it applies to, and whether it applies at all,
 * is a layout decision the stylesheet makes - a stacked split has to be able to
 * ignore it, and an inline `flex-grow` would outrank the media query that does
 * the stacking.
 */
const shareStyle = (share: number): React.CSSProperties =>
  ({ '--mdxstudio-split-share': String(Number(share.toFixed(3))) }) as React.CSSProperties;

const heightStyle = (height: string | null): React.CSSProperties | undefined =>
  height ? ({ '--mdxstudio-split-height': height } as React.CSSProperties) : undefined;

export function Split({ direction, ratio, height, children }: SplitProps) {
  const { renderMode } = useContext(MdxRenderContext);
  const isPdf = renderMode === 'pdf';

  const panes = useMemo(() => splitPanes(children), [children]);
  const authored = useMemo(
    () => normaliseSplitShares(ratio, panes.length),
    [ratio, panes.length]
  );

  const [shares, setShares] = useState<number[]>(authored);
  // Re-resolved when the document rewrites the panes under them, which is what
  // every keystroke in an editor does. Keyed on the shares themselves so a
  // re-render with the same ratio does not undo a drag.
  const signature = authored.join(',');
  const lastSignature = useRef(signature);
  if (lastSignature.current !== signature) {
    lastSignature.current = signature;
    setShares(authored);
  }

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(-1);

  const axis: SplitDirection = direction === 'column' ? 'column' : 'row';

  // An A4 page is not a screen. A row that would put a pane below the legible
  // floor is stacked for the export instead, so every pane is printed at full
  // width under its own title rather than as a ribbon nobody can read.
  const printable = PDF_SHEET_CONTENT_PX - SPLIT_GUTTER_PX * (panes.length - 1);
  const exportStacks =
    isPdf &&
    (axis === 'column' || shares.some((share) => (share / 100) * printable < PDF_MIN_PANE_PX));
  const renderAxis: SplitDirection = exportStacks ? 'column' : axis;
  const trackHeight = isPdf ? null : splitHeight(height, axis);

  const boundaryLabel = (index: number) => {
    const before = panes[index]?.label;
    const after = panes[index + 1]?.label;
    if (before && after) return `Resize ${before} and ${after}`;
    return `Resize panes ${index + 1} and ${index + 2}`;
  };

  const positionFromPointer = (
    index: number,
    event: React.PointerEvent<HTMLDivElement>
  ): number | null => {
    const track = trackRef.current;
    if (!track) return null;

    const isRow = renderAxis === 'row';
    const bounds = track.getBoundingClientRect();
    const divider = event.currentTarget;

    return splitPointerPosition({
      point: isRow ? event.clientX : event.clientY,
      start: isRow ? bounds.left : bounds.top,
      extent: isRow ? bounds.width : bounds.height,
      dividerSize: isRow ? divider.offsetWidth : divider.offsetHeight,
      dividers: panes.length - 1,
      before: index,
    });
  };

  const onPointerDown = (index: number) => (event: React.PointerEvent<HTMLDivElement>) => {
    // Otherwise the drag starts a text selection across both panes.
    event.preventDefault();
    // Capturing means a fast drag that outruns the pointer keeps reporting here
    // rather than to whatever it happened to pass over.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(index);
  };

  const onPointerMove = (index: number) => (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragging !== index) return;
    const position = positionFromPointer(index, event);
    if (position === null) return;
    setShares((current) => moveSplitBoundary(current, index, position));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(-1);
  };

  /** Both axes answer all four arrows: the divider is small, the keys are free. */
  const onKeyDown = (index: number) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    const { key } = event;

    if (key === 'Home' || key === 'Enter') {
      event.preventDefault();
      setShares(authored);
      return;
    }

    const step = event.shiftKey ? SPLIT_STEP_LARGE : SPLIT_STEP;
    const delta =
      key === 'ArrowLeft' || key === 'ArrowUp'
        ? -step
        : key === 'ArrowRight' || key === 'ArrowDown'
          ? step
          : 0;
    if (delta === 0) return;

    event.preventDefault();
    setShares((current) =>
      moveSplitBoundary(current, index, splitBoundaryPosition(current, index) + delta)
    );
  };

  // Nothing to compare, and nothing worth an empty box either.
  if (panes.length === 0) return null;

  const className = [
    'mdxstudio-split',
    `mdxstudio-split--${renderAxis}`,
    trackHeight ? 'mdxstudio-split--sized' : '',
    isPdf ? 'mdxstudio-split--pdf' : '',
    dragging >= 0 ? 'mdxstudio-split--dragging' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const Grip = renderAxis === 'row' ? GripVertical : GripHorizontal;

  return (
    <div ref={trackRef} className={className} style={heightStyle(trackHeight)}>
      {panes.map((pane, index) => {
        // A stacked export loses the one thing that told the panes apart, so a
        // pane that never named itself is numbered rather than left anonymous.
        const heading = pane.title ?? (exportStacks ? `Pane ${index + 1}` : null);
        const hasHead = heading !== null || Boolean(pane.badge);

        const nodes: React.ReactNode[] = [];

        if (index > 0) {
          const boundary = splitBoundaryPosition(shares, index - 1);
          const before = shares.slice(0, index - 1).reduce((sum, share) => sum + share, 0);
          const pair = shares[index - 1] + shares[index];

          nodes.push(
            isPdf ? (
              // The export deletes every button and cannot be dragged anyway, so
              // the seam is all that is left of the divider.
              <div
                key={`divider-${index}`}
                role="separator"
                aria-orientation={renderAxis === 'row' ? 'vertical' : 'horizontal'}
                className="mdxstudio-split__divider mdxstudio-split__divider--static"
              >
                <span className="mdxstudio-split__seam" />
              </div>
            ) : (
              <div
                key={`divider-${index}`}
                role="separator"
                aria-orientation={renderAxis === 'row' ? 'vertical' : 'horizontal'}
                aria-label={boundaryLabel(index - 1)}
                aria-valuenow={Math.round(boundary)}
                aria-valuemin={Math.round(before + SPLIT_MIN_SHARE)}
                aria-valuemax={Math.round(before + pair - SPLIT_MIN_SHARE)}
                tabIndex={0}
                title="Drag to resize, double-click to reset"
                onPointerDown={onPointerDown(index - 1)}
                onPointerMove={onPointerMove(index - 1)}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onKeyDown={onKeyDown(index - 1)}
                onDoubleClick={() => setShares(authored)}
                className={`mdxstudio-split__divider${
                  dragging === index - 1 ? ' mdxstudio-split__divider--active' : ''
                }`}
              >
                <span className="mdxstudio-split__seam" />
                <span className="mdxstudio-split__grip">
                  <Grip className="mdxstudio-icon-14" />
                </span>
              </div>
            )
          );
        }

        nodes.push(
          <div
            key={`pane-${index}`}
            className="mdxstudio-split__pane"
            style={shareStyle(shares[index] ?? 100 / panes.length)}
          >
            {hasHead && (
              <div className="mdxstudio-split__head">
                <span className="mdxstudio-split__label">
                  {pane.icon && (
                    <span className="mdxstudio-split__icon">
                      <DynamicIcon name={pane.icon} className="mdxstudio-icon-14" />
                    </span>
                  )}
                  {heading !== null && <span className="mdxstudio-split__title">{heading}</span>}
                </span>
                {pane.badge && <span className="mdxstudio-split__badge">{pane.badge}</span>}
              </div>
            )}
            <div className="mdxstudio-split__body">{pane.content}</div>
          </div>
        );

        return <React.Fragment key={`slot-${index}`}>{nodes}</React.Fragment>;
      })}
    </div>
  );
}

/**
 * One side of a comparison. Read by `<Split>` from its props rather than
 * mounted, the way `<Tab>` is; on its own it is a one-pane split, so its
 * content is still on the page.
 */
export function Pane(props: PaneProps) {
  return (
    <Split>
      <Pane {...props} />
    </Split>
  );
}

// Built-in custom components available in MDX scope. Heavier components
// (Mermaid, charts, flow graphs) live in their own packages and reach the
// renderer through their own plugins - see ./plugin.
export const baseMdxComponents = {
  Callout,
  Card,
  CardGrid,
  Stat,
  StatGrid,
  Tabs,
  Tab,
  Accordion,
  AccordionItem,
  Split,
  Pane,
  InteractiveCounter,
  ProgressBar,
  Timeline,
  Steps,
  Step,
  Kbd,
  Badge,
  Button,
  Table: TableComponent,
  InlineCode,
  MathExpression,
};

/** Extra tag names the built-in components also answer to. */
export const baseMdxAliases = {
  Counter: 'InteractiveCounter',
  CustomTable: 'Table',
  Code: 'InlineCode',
  // What the component is for, next to what it is. Nothing generic - `Row`,
  // `Column` and `Box` belong to the document, not to us.
  Compare: 'Split',
};
