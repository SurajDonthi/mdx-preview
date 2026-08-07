import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { InlineToken } from './InlineToken';

// Helper to render Lucide icon dynamically
function DynamicIcon({ name, className = 'mdxkit-icon-20' }: { name?: string; className?: string }) {
  if (!name) return null;
  const IconComponent = (Icons as Record<string, any>)[name] || Icons.HelpCircle;
  return <IconComponent className={className} />;
}

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
    <div className={`mdxkit-callout mdxkit-callout--${variant}`}>
      <div className="mdxkit-callout__row">
        <div className="mdxkit-callout__icon">
          <DynamicIcon name={CALLOUT_ICONS[variant]} className="mdxkit-icon-20" />
        </div>
        <div className="mdxkit-callout__content">
          {title && <div className="mdxkit-callout__title">{title}</div>}
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
    <div className="mdxkit-card">
      <div className="mdxkit-card__head">
        <div className="mdxkit-card__identity">
          {icon && (
            <div className="mdxkit-card__icon">
              <DynamicIcon name={icon} className="mdxkit-icon-20" />
            </div>
          )}
          <div>
            <h4 className="mdxkit-card__title">{title}</h4>
            {subtitle && <p className="mdxkit-card__subtitle">{subtitle}</p>}
          </div>
        </div>
        {badge && <span className="mdxkit-card__badge">{badge}</span>}
      </div>
      {description && <p className="mdxkit-card__description">{description}</p>}
      {children && <div className="mdxkit-card__body">{children}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="mdxkit-card-link">
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

  return <div className={`mdxkit-card-grid mdxkit-card-grid--${columns}`}>{children}</div>;
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
    <div className="mdxkit-stat">
      <div className="mdxkit-stat__head">
        <span>{title}</span>
        {icon && <DynamicIcon name={icon} className="mdxkit-icon-16 mdxkit-stat__icon" />}
      </div>
      <div className="mdxkit-stat__row">
        <span className="mdxkit-stat__value">{value}</span>
        {change && (
          <span className={`mdxkit-stat__change mdxkit-stat__change--${direction}`}>{change}</span>
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

  return <div className={`mdxkit-stat-grid mdxkit-stat-grid--${columns}`}>{children}</div>;
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
    <div className="mdxkit-tabs">
      <div className="mdxkit-tabs__list">
        {tabLabels.map((label, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`mdxkit-tabs__tab${activeIndex === idx ? ' mdxkit-tabs__tab--active' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mdxkit-tabs__panel">{childArray[activeIndex] || childArray}</div>
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
    <div className="mdxkit-accordion">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={idx} className="mdxkit-accordion__item">
            <button
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="mdxkit-accordion__trigger"
            >
              <span>{item.title}</span>
              <Icons.ChevronDown
                className={`mdxkit-icon-16 mdxkit-accordion__chevron${
                  isOpen ? ' mdxkit-accordion__chevron--open' : ''
                }`}
              />
            </button>
            {isOpen && <div className="mdxkit-accordion__panel">{item.content}</div>}
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
    <div className="mdxkit-counter">
      <div>
        <h5 className="mdxkit-counter__title">{title}</h5>
        <p className="mdxkit-counter__range">
          Range: {min} to {max} | Step: {step}
        </p>
      </div>
      <div className="mdxkit-counter__controls">
        <button
          onClick={() => setCount(Math.max(min, count - step))}
          disabled={count <= min}
          className="mdxkit-counter__button"
        >
          <Icons.Minus className="mdxkit-icon-16" />
        </button>
        <span className="mdxkit-counter__value">{count}</span>
        <button
          onClick={() => setCount(Math.min(max, count + step))}
          disabled={count >= max}
          className="mdxkit-counter__button"
        >
          <Icons.Plus className="mdxkit-icon-16" />
        </button>
        <button onClick={() => setCount(initial)} title="Reset" className="mdxkit-counter__reset">
          <Icons.RotateCcw className="mdxkit-icon-14" />
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
    <div className="mdxkit-progress">
      {(label || progress !== undefined) && (
        <div className="mdxkit-progress__labels">
          <span>{label}</span>
          <span>{progress}%</span>
        </div>
      )}
      <div className="mdxkit-progress__track">
        <div
          className={`mdxkit-progress__fill mdxkit-progress__fill--${tone}`}
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
    <div className="mdxkit-timeline">
      {items.map((item, idx) => (
        <div key={idx} className="mdxkit-timeline__item">
          <div className="mdxkit-timeline__marker">
            <DynamicIcon name={item.icon || 'CircleDot'} className="mdxkit-icon-14" />
          </div>
          <div className="mdxkit-timeline__date">{item.date}</div>
          <h5 className="mdxkit-timeline__title">{item.title}</h5>
          <p className="mdxkit-timeline__description">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({ children }: { children?: React.ReactNode }) {
  return <div className="mdxkit-steps">{children}</div>;
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
    <div className="mdxkit-step">
      <div className="mdxkit-step__number">{number}</div>
      <div>
        <h5 className="mdxkit-step__title">{title}</h5>
        <div className="mdxkit-step__body">{children}</div>
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
  return <kbd className="mdxkit-kbd">{children}</kbd>;
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
    <span className={`mdxkit-badge mdxkit-badge--${tone}`}>
      {icon && <DynamicIcon name={icon} className="mdxkit-icon-14" />}
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
    <button onClick={handleClick} className={`mdxkit-button mdxkit-button--${tone}`}>
      {icon && <DynamicIcon name={icon} className="mdxkit-icon-16" />}
      {children}
      {clicked && <Icons.Check className="mdxkit-icon-16 mdxkit-button__done" />}
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
    <div className="mdxkit-datatable">
      {title && (
        <div className="mdxkit-datatable__caption">
          <Icons.Table className="mdxkit-icon-16 mdxkit-datatable__caption-icon" />
          <span>{title}</span>
        </div>
      )}
      <div className="mdxkit-datatable__scroll">
        <table className="mdxkit-table">
          {headers.length > 0 && (
            <thead className="mdxkit-thead">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="mdxkit-datatable__th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="mdxkit-tbody">
            {effectiveRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={`mdxkit-tr${
                  striped && rIdx % 2 === 1 ? ' mdxkit-datatable__row--striped' : ''
                }`}
              >
                {row.map((cell: any, cIdx: number) => (
                  <td key={cIdx} className="mdxkit-datatable__td">
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
};

/** Extra tag names the built-in components also answer to. */
export const baseMdxAliases = {
  Counter: 'InteractiveCounter',
  CustomTable: 'Table',
  Code: 'InlineCode',
};
