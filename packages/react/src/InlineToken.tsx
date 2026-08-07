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

/**
 * Shared geometry for short inline tokens. Appearance follows the ambient
 * theme, but sizing and alignment stay identical across render modes.
 *
 * `tone` is an escape hatch: left out, the token takes the theme the renderer
 * root declares; supplied, it pins the token to that side regardless.
 */
export function InlineToken({
  as = 'span',
  kind,
  tone,
  appearanceClassName = '',
  children,
  ...props
}: InlineTokenProps) {
  return React.createElement(
    as,
    {
      ...props,
      'data-inline-token': kind,
      'data-mdxstudio-tone': tone,
      className: `mdxstudio-token mdxstudio-token--${kind} ${appearanceClassName}`.trim(),
    },
    children
  );
}
