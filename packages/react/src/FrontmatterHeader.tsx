import { useContext } from 'react';
import { MdxRenderContext } from '@mdxkit/core';
import type { Frontmatter, MdxRenderMode, MdxThemeCategory } from '@mdxkit/core';
import { InlineToken } from './InlineToken';
import * as Icons from 'lucide-react';

/** Helper to convert camelCase, snake_case, or kebab-case keys into Title Case labels */
function formatKeyToLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function formatValue(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item, seen)).filter(Boolean).join(', ');
  }
  return Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => `${formatKeyToLabel(key)}: ${formatValue(item, seen)}`)
    .filter((item) => !item.endsWith(': '))
    .join('; ');
}

function normalizeList(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : value === null || value === undefined
      ? []
      : [value];
  return values.map((item) => formatValue(item).trim()).filter(Boolean);
}

export function FrontmatterHeader({
  frontmatter,
  themeCategory,
  renderMode,
}: {
  frontmatter: Frontmatter | null;
  themeCategory?: MdxThemeCategory;
  renderMode?: MdxRenderMode;
}) {
  const context = useContext(MdxRenderContext);
  if (!frontmatter) return null;

  const effectiveRenderMode = renderMode ?? context.renderMode;
  const effectiveThemeCategory = themeCategory ?? context.themeCategory;
  const isPdf = effectiveRenderMode === 'pdf';
  const isDark = !isPdf && effectiveThemeCategory === 'dark';

  const {
    title,
    subtitle,
    description,
    author,
    authors,
    authorAvatar,
    date,
    tags,
    category,
    status,
    readTime,
    publisher,
    edition,
    sourcePages,
    summaryType,
    ...rest
  } = frontmatter;

  const authorList = [...normalizeList(author), ...normalizeList(authors)]
    .filter((name, index, list) => list.indexOf(name) === index);
  const displayAuthor = authorList.join(', ');
  const tagList = normalizeList(tags);
  const displayDate = formatValue(date);
  const avatarSrc = typeof authorAvatar === 'string' ? authorAvatar : '';

  // Catch-all extra dynamic fields
  const extraFields: { label: string; value: string }[] = [];

  // Known secondary keys to format cleanly if present
  if (publisher) extraFields.push({ label: 'Publisher', value: formatValue(publisher) });
  if (edition) extraFields.push({ label: 'Edition', value: formatValue(edition) });
  if (sourcePages) extraFields.push({ label: 'Source Pages', value: `${formatValue(sourcePages)} pages` });
  if (summaryType) extraFields.push({ label: 'Summary Type', value: formatValue(summaryType) });

  // Add any additional dynamic frontmatter keys
  Object.entries(rest).forEach(([key, val]) => {
    const displayVal = formatValue(val);
    if (!displayVal) return;
    extraFields.push({
      label: formatKeyToLabel(key),
      value: displayVal,
    });
  });

  const border = isDark ? 'border-slate-800' : 'border-slate-200';
  const primaryText = isDark ? 'text-slate-100' : 'text-slate-900';
  const secondaryText = isDark ? 'text-slate-300' : 'text-slate-700';
  const mutedText = isDark ? 'text-slate-400' : 'text-slate-600';

  return (
    <div
      data-pdf-frontmatter="true"
      data-theme-category={effectiveThemeCategory}
      className={`mb-8 p-6 sm:p-7 rounded-2xl border shadow-sm ${border} ${primaryText} ${
        isPdf
          ? 'bg-white'
          : isDark
            ? 'bg-slate-900/80 backdrop-blur-md transition-colors'
            : 'bg-white backdrop-blur-md transition-colors'
      }`}
    >
      {/* Top Badges & Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {category && (
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${isDark ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
            {formatValue(category)}
          </span>
        )}
        {status && (
          <span className={`px-3 py-1 text-xs font-semibold rounded-full border flex items-center gap-1.5 ${isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            <span
              // The export pass clears every background, so the dot carries its
              // own colour through as an explicit swatch.
              data-pdf-swatch={isPdf ? '#10b981' : undefined}
              className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isPdf ? '' : 'animate-pulse'}`}
            />
            {formatValue(status)}
          </span>
        )}
        {readTime && (
          <span className={`text-xs font-medium flex items-center gap-1.5 ml-auto ${mutedText}`}>
            <Icons.Clock className="w-3.5 h-3.5 text-slate-400" />
            {formatValue(readTime)}
          </span>
        )}
      </div>

      {/* Main Title */}
      {title && (
        <h1 className={`text-2xl sm:text-3xl font-bold tracking-tight mb-2 leading-tight ${primaryText}`}>
          {formatValue(title)}
        </h1>
      )}

      {/* Subtitle */}
      {subtitle && (
        <h2 className={`text-base sm:text-lg font-medium mb-3 leading-snug ${secondaryText}`}>
          {formatValue(subtitle)}
        </h2>
      )}

      {/* Main Description */}
      {description && (
        <p className={`text-sm sm:text-base leading-relaxed mb-4 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
          {formatValue(description)}
        </p>
      )}

      {/* Author, Date & Tags Row */}
      {(displayAuthor || displayDate || tagList.length > 0) && (
        <div className={`flex flex-wrap items-center justify-between gap-4 pt-4 border-t text-xs ${border} ${secondaryText}`}>
          <div className="flex flex-wrap items-center gap-4">
            {avatarSrc && (
              <img
                src={avatarSrc}
                alt={displayAuthor || 'Author'}
                className={`w-8 h-8 rounded-full object-cover border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}
              />
            )}
            {displayAuthor && (
              <div className={`flex items-center gap-1.5 font-medium ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <Icons.User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{displayAuthor}</span>
              </div>
            )}
            {displayDate && (
              <div className={`flex items-center gap-1.5 ${mutedText}`}>
                <Icons.Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{displayDate}</span>
              </div>
            )}
          </div>

          {tagList.length > 0 && (
            <div className="grid min-w-0 max-w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-x-1.5">
              <span className="inline-flex h-5 items-center" aria-hidden="true">
                <Icons.Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </span>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {tagList.map((tag, i) => (
                  <InlineToken
                    key={`${tag}-${i}`}
                    kind="tag"
                    tone={isDark ? 'dark' : 'light'}
                  >
                    #{tag}
                  </InlineToken>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Extensible Extra Frontmatter Fields Grid (NO TRUNCATION) */}
      {extraFields.length > 0 && (
        <div className={`mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs ${border}`}>
          {extraFields.map(({ label, value }, index) => (
            <div
              data-pdf-frontmatter-field="true"
              key={`${label}-${index}`}
              className={`flex flex-col p-2.5 rounded-lg border ${isDark ? 'bg-slate-800/40 border-slate-800/40' : 'bg-slate-50 border-slate-200/80'}`}
            >
              <span className={`text-[10px] font-semibold uppercase tracking-wider mb-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {label}
              </span>
              <span className={`font-medium break-words leading-snug ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
