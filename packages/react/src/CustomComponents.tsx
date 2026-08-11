import React, { useState } from 'react';
import { Check, ChevronDown, Minus, Plus, RotateCcw, Table } from 'lucide-react';
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

// 5. Accordion
export interface AccordionItem {
  title: string;
  content: string | React.ReactNode;
}

export function Accordion({ items = [] }: { items?: AccordionItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mdxstudio-accordion">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={idx} className="mdxstudio-accordion__item">
            <button
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="mdxstudio-accordion__trigger"
            >
              <span>{item.title}</span>
              <ChevronDown
                className={`mdxstudio-icon-16 mdxstudio-accordion__chevron${
                  isOpen ? ' mdxstudio-accordion__chevron--open' : ''
                }`}
              />
            </button>
            {isOpen && <div className="mdxstudio-accordion__panel">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
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
const PROGRESS_COLORS = new Set(['indigo', 'emerald', 'amber', 'rose', 'purple', 'cyan']);

export function ProgressBar({
  progress = 50,
  label,
  color = 'indigo',
}: {
  progress?: number;
  label?: string;
  color?: string;
}) {
  const tone = PROGRESS_COLORS.has(color) ? color : 'indigo';

  return (
    <div className="mdxstudio-progress">
      {(label || progress !== undefined) && (
        <div className="mdxstudio-progress__labels">
          <span>{label}</span>
          <span>{progress}%</span>
        </div>
      )}
      <div className="mdxstudio-progress__track">
        <div
          className={`mdxstudio-progress__fill mdxstudio-progress__fill--${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
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
};
