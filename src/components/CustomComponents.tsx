import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { MermaidDiagram } from './MermaidDiagram';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
} from 'recharts';

// Helper to render Lucide icon dynamically
function DynamicIcon({ name, className = 'w-5 h-5' }: { name?: string; className?: string }) {
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

export function Callout({ type = 'info', title, children }: CalloutProps) {
  const styles = {
    info: {
      bg: 'bg-blue-500/10 border-blue-500/30 text-blue-800 dark:text-blue-300',
      icon: 'Info',
      iconColor: 'text-blue-500',
    },
    warning: {
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300',
      icon: 'AlertTriangle',
      iconColor: 'text-amber-500',
    },
    success: {
      bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300',
      icon: 'CheckCircle2',
      iconColor: 'text-emerald-500',
    },
    error: {
      bg: 'bg-red-500/10 border-red-500/30 text-red-800 dark:text-red-300',
      icon: 'OctagonAlert',
      iconColor: 'text-red-500',
    },
    note: {
      bg: 'bg-purple-500/10 border-purple-500/30 text-purple-800 dark:text-purple-300',
      icon: 'Sparkles',
      iconColor: 'text-purple-500',
    },
  };

  const style = styles[type] || styles.info;

  return (
    <div className={`my-4 p-4 rounded-xl border backdrop-blur-sm ${style.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${style.iconColor}`}>
          <DynamicIcon name={style.icon} className="w-5 h-5" />
        </div>
        <div className="flex-1 text-sm leading-relaxed">
          {title && <div className="font-semibold text-base mb-1">{title}</div>}
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
    <div className="group relative p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200 my-2">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          {icon && (
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <DynamicIcon name={icon} className="w-5 h-5" />
            </div>
          )}
          <div>
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-lg leading-tight">
              {title}
            </h4>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {badge && (
          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            {badge}
          </span>
        )}
      </div>
      {description && (
        <p className="text-sm text-slate-600 dark:text-slate-300 my-2 leading-relaxed">
          {description}
        </p>
      )}
      {children && <div className="mt-3 text-sm">{children}</div>}
    </div>
  );

  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block no-underline">
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
  const gridColsClass =
    cols === 3
      ? 'grid-cols-1 md:grid-cols-3'
      : cols === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : 'grid-cols-1 md:grid-cols-2';

  return <div className={`grid ${gridColsClass} gap-4 my-6`}>{children}</div>;
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
  const trendColor =
    trend === 'up'
      ? 'text-emerald-500 bg-emerald-500/10'
      : trend === 'down'
      ? 'text-rose-500 bg-rose-500/10'
      : 'text-slate-500 bg-slate-500/10';

  return (
    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
        <span>{title}</span>
        {icon && <DynamicIcon name={icon} className="w-4 h-4 text-slate-400" />}
      </div>
      <div className="flex items-baseline justify-between mt-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </span>
        {change && (
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${trendColor}`}>
            {change}
          </span>
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
  const gridColsClass =
    cols === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : cols === 4
      ? 'grid-cols-2 md:grid-cols-4'
      : 'grid-cols-1 sm:grid-cols-3';

  return <div className={`grid ${gridColsClass} gap-3 my-4`}>{children}</div>;
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
    <div className="my-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 overflow-hidden">
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-950/70 px-2 pt-2 gap-1 overflow-x-auto">
        {tabLabels.map((label, idx) => (
          <button
            key={idx}
            onClick={() => setActiveIndex(idx)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
              activeIndex === idx
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm border-t border-x border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="p-5 bg-white dark:bg-slate-900">
        {childArray[activeIndex] || childArray}
      </div>
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
    <div className="my-4 divide-y divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-white/50 dark:bg-slate-900/50">
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={idx} className="transition-colors">
            <button
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="w-full flex items-center justify-between p-4 text-left font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <span>{item.title}</span>
              <Icons.ChevronDown
                className={`w-4 h-4 transition-transform duration-200 text-slate-400 ${
                  isOpen ? 'rotate-180 text-indigo-500' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="p-4 pt-0 text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-950/30">
                {item.content}
              </div>
            )}
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
    <div className="my-4 p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/30 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        <h5 className="font-semibold text-slate-900 dark:text-slate-100 text-base">{title}</h5>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Range: {min} to {max} | Step: {step}
        </p>
      </div>
      <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <button
          onClick={() => setCount(Math.max(min, count - step))}
          disabled={count <= min}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
        >
          <Icons.Minus className="w-4 h-4" />
        </button>
        <span className="w-12 text-center font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400">
          {count}
        </span>
        <button
          onClick={() => setCount(Math.min(max, count + step))}
          disabled={count >= max}
          className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
        >
          <Icons.Plus className="w-4 h-4" />
        </button>
        <button
          onClick={() => setCount(initial)}
          title="Reset"
          className="p-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ml-1 border-l border-slate-200 dark:border-slate-800"
        >
          <Icons.RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// 7. Progress Bar
export function ProgressBar({
  progress = 50,
  label,
  color = 'indigo',
}: {
  progress?: number;
  label?: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-600',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    purple: 'bg-purple-600',
    cyan: 'bg-cyan-500',
  };

  const bg = colorMap[color] || 'bg-indigo-600';

  return (
    <div className="my-4">
      {(label || progress !== undefined) && (
        <div className="flex justify-between text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
          <span>{label}</span>
          <span>{progress}%</span>
        </div>
      )}
      <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full ${bg} transition-all duration-500 rounded-full`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  );
}

// 8. Recharts Chart Component
export interface ChartProps {
  type?: 'line' | 'bar' | 'area';
  data?: Array<Record<string, any>>;
  dataKey?: string;
  nameKey?: string;
  title?: string;
  height?: number;
  color?: string;
}

export function Chart({
  type = 'line',
  data = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 650 },
    { name: 'Mar', value: 900 },
    { name: 'Apr', value: 850 },
    { name: 'May', value: 1200 },
    { name: 'Jun', value: 1600 },
  ],
  dataKey = 'value',
  nameKey = 'name',
  title,
  height = 240,
  color = '#6366f1',
}: ChartProps) {
  return (
    <div className="my-6 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md">
      {title && (
        <h5 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-4">{title}</h5>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#888888" />
              <YAxis tick={{ fontSize: 12 }} stroke="#888888" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Bar dataKey={dataKey} fill={color} radius={[6, 6, 0, 0]} />
            </BarChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#888888" />
              <YAxis tick={{ fontSize: 12 }} stroke="#888888" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                fillOpacity={1}
                fill="url(#chartGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey={nameKey} tick={{ fontSize: 12 }} stroke="#888888" />
              <YAxis tick={{ fontSize: 12 }} stroke="#888888" />
              <RechartsTooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  borderRadius: '8px',
                  color: '#fff',
                }}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={3}
                dot={{ r: 4, fill: color }}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
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
    <div className="my-6 relative pl-6 border-l-2 border-indigo-500/30 space-y-6">
      {items.map((item, idx) => (
        <div key={idx} className="relative group">
          <div className="absolute -left-[31px] top-1 p-1.5 rounded-full bg-white dark:bg-slate-900 border-2 border-indigo-500 text-indigo-500">
            <DynamicIcon name={item.icon || 'CircleDot'} className="w-3.5 h-3.5" />
          </div>
          <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">
            {item.date}
          </div>
          <h5 className="font-semibold text-slate-900 dark:text-slate-100 text-base">
            {item.title}
          </h5>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{item.description}</p>
        </div>
      ))}
    </div>
  );
}

export function Steps({ children }: { children?: React.ReactNode }) {
  return <div className="my-6 space-y-4">{children}</div>;
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
    <div className="flex gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40">
      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center shrink-0 text-sm">
        {number}
      </div>
      <div>
        <h5 className="font-semibold text-slate-900 dark:text-slate-100 text-base">{title}</h5>
        <div className="text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

// 10. Kbd & Badge & InlineCode
export function InlineCode({ children }: { children?: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 mx-0.5 rounded-md text-[0.85em] font-mono font-medium border border-slate-700/40 bg-slate-800/60 text-cyan-300 dark:text-cyan-300 inline-block align-baseline">
      {children}
    </code>
  );
}

export function Kbd({ children }: { children?: React.ReactNode }) {
  return (
    <kbd className="px-2 py-1 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md shadow-xs">
      {children}
    </kbd>
  );
}

export function Badge({
  variant = 'indigo',
  icon,
  children,
}: {
  variant?: string;
  icon?: string;
  children?: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    indigo: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    emerald: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    rose: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    amber: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };

  const style = styles[variant] || styles.indigo;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${style} mx-1`}
    >
      {icon && <DynamicIcon name={icon} className="w-3.5 h-3.5" />}
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

  const styles = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
    secondary: 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100',
    outline: 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200',
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${styles[variant]} active:scale-95 my-2`}
    >
      {icon && <DynamicIcon name={icon} className="w-4 h-4" />}
      {children}
      {clicked && <Icons.Check className="w-4 h-4 text-emerald-400 ml-1" />}
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
    <div className="my-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 shadow-xs overflow-hidden backdrop-blur-md">
      {title && (
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 font-semibold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
          <Icons.Table className="w-4 h-4 text-indigo-500" />
          <span>{title}</span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left border-collapse">
          {headers.length > 0 && (
            <thead className="bg-slate-100/90 dark:bg-slate-800/90 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="px-5 py-3.5 font-bold border-r last:border-r-0 border-slate-200/70 dark:border-slate-700/70 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-slate-200/80 dark:divide-slate-800/80 text-slate-700 dark:text-slate-300">
            {effectiveRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className={`hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors ${
                  striped && rIdx % 2 === 1 ? 'bg-slate-50/40 dark:bg-slate-900/30' : ''
                }`}
              >
                {row.map((cell: any, cIdx: number) => (
                  <td key={cIdx} className="px-5 py-3.5 border-r last:border-r-0 border-slate-200/50 dark:border-slate-800/50">
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

// Map of all built-in custom components available in MDX scope
export const mdxComponentsMap = {
  Callout,
  Card,
  CardGrid,
  Stat,
  StatGrid,
  Tabs,
  Tab,
  Accordion,
  InteractiveCounter,
  Counter: InteractiveCounter, // alias
  ProgressBar,
  Chart,
  Timeline,
  Steps,
  Step,
  Kbd,
  Badge,
  Button,
  Table: TableComponent,
  CustomTable: TableComponent,
  InlineCode,
  Code: InlineCode,
  MermaidDiagram,
  Mermaid: MermaidDiagram,
};
