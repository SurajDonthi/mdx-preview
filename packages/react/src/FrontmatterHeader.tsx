import { useContext } from 'react';
import { MdxRenderContext } from '@mdxstudio/core';
import type { Frontmatter, MdxRenderMode, MdxThemeCategory } from '@mdxstudio/core';
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

  return (
    <div
      data-pdf-frontmatter="true"
      data-theme-category={effectiveThemeCategory}
      // The card is nested inside the renderer root, which already declares the
      // theme. The export pass forces the light side, so it says so here too.
      data-mdxkit-theme={isDark ? 'dark' : 'light'}
      className={`mdxkit-frontmatter${isPdf ? ' mdxkit-frontmatter--pdf' : ''}`}
    >
      {/* Top Badges & Pills */}
      <div className="mdxkit-frontmatter__pills">
        {category && (
          <span
            data-pdf-frontmatter-pill="true"
            className="mdxkit-frontmatter__pill mdxkit-frontmatter__pill--category"
          >
            {formatValue(category)}
          </span>
        )}
        {status && (
          <span
            data-pdf-frontmatter-pill="true"
            className="mdxkit-frontmatter__pill mdxkit-frontmatter__pill--status"
          >
            <span
              // The export pass clears every background, so the dot carries its
              // own colour through as an explicit swatch.
              data-pdf-swatch={isPdf ? '#10b981' : undefined}
              className={`mdxkit-frontmatter__dot${isPdf ? '' : ' mdxkit-frontmatter__dot--pulse'}`}
            />
            {formatValue(status)}
          </span>
        )}
        {readTime && (
          <span className="mdxkit-frontmatter__readtime">
            <Icons.Clock className="mdxkit-icon-14 mdxkit-frontmatter__icon" />
            {formatValue(readTime)}
          </span>
        )}
      </div>

      {/* Main Title */}
      {title && <h1 className="mdxkit-frontmatter__title">{formatValue(title)}</h1>}

      {/* Subtitle */}
      {subtitle && <h2 className="mdxkit-frontmatter__subtitle">{formatValue(subtitle)}</h2>}

      {/* Main Description */}
      {description && (
        <p className="mdxkit-frontmatter__description">{formatValue(description)}</p>
      )}

      {/* Author, Date & Tags Row */}
      {(displayAuthor || displayDate || tagList.length > 0) && (
        <div className="mdxkit-frontmatter__meta">
          <div className="mdxkit-frontmatter__meta-left">
            {avatarSrc && (
              <img
                src={avatarSrc}
                alt={displayAuthor || 'Author'}
                className="mdxkit-frontmatter__avatar"
              />
            )}
            {displayAuthor && (
              <div className="mdxkit-frontmatter__author">
                <Icons.User className="mdxkit-icon-14 mdxkit-frontmatter__icon" />
                <span>{displayAuthor}</span>
              </div>
            )}
            {displayDate && (
              <div className="mdxkit-frontmatter__date">
                <Icons.Calendar className="mdxkit-icon-14 mdxkit-frontmatter__icon" />
                <span>{displayDate}</span>
              </div>
            )}
          </div>

          {tagList.length > 0 && (
            <div className="mdxkit-frontmatter__tags">
              <span className="mdxkit-frontmatter__tags-icon" aria-hidden="true">
                <Icons.Tag className="mdxkit-icon-14 mdxkit-frontmatter__icon" />
              </span>
              <div className="mdxkit-frontmatter__tags-list">
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
        <div className="mdxkit-frontmatter__fields">
          {extraFields.map(({ label, value }, index) => (
            <div
              data-pdf-frontmatter-field="true"
              key={`${label}-${index}`}
              className="mdxkit-frontmatter__field"
            >
              <span className="mdxkit-frontmatter__field-label">{label}</span>
              <span className="mdxkit-frontmatter__field-value">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
