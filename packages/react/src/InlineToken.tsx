import React from 'react';

export type InlineTokenKind = 'tag' | 'code';
export type InlineTokenTone = 'light' | 'dark';

type InlineTokenElement = 'span' | 'code';

interface InlineTokenProps extends Omit<React.HTMLAttributes<HTMLElement>, 'className'> {
  as?: InlineTokenElement;
  kind: InlineTokenKind;
  tone?: InlineTokenTone;
  appearanceClassName?: string;
}

const geometryClasses: Record<InlineTokenKind, string> = {
  tag: 'inline-flex min-h-5 items-center justify-center whitespace-nowrap align-middle px-2 py-0.5 rounded-md border text-[11px] leading-none font-mono',
  code: 'inline-flex min-h-[1.375rem] items-center justify-center whitespace-nowrap align-middle px-1.5 py-0.5 mx-0.5 rounded-md border text-[0.85em] leading-none font-mono font-medium',
};

const appearanceClasses: Record<InlineTokenKind, Record<InlineTokenTone, string>> = {
  tag: {
    light: 'bg-slate-100 text-slate-700 border-slate-200',
    dark: 'bg-slate-800 text-slate-300 border-slate-700/60',
  },
  code: {
    light: 'bg-slate-100 text-indigo-700 border-slate-200',
    dark: 'bg-slate-800/80 text-cyan-300 border-slate-700/50',
  },
};

/**
 * Shared geometry for short inline tokens. Theme-specific classes may alter
 * appearance, but sizing and alignment stay identical across render modes.
 */
export function InlineToken({
  as = 'span',
  kind,
  tone = 'light',
  appearanceClassName = '',
  children,
  ...props
}: InlineTokenProps) {
  return React.createElement(
    as,
    {
      ...props,
      'data-inline-token': kind,
      className: `${geometryClasses[kind]} ${appearanceClasses[kind][tone]} ${appearanceClassName}`.trim(),
    },
    children
  );
}
