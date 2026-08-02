import { Frontmatter } from '../types';
import * as Icons from 'lucide-react';

/** Helper to convert camelCase, snake_case, or kebab-case keys into Title Case labels */
function formatKeyToLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

export function FrontmatterHeader({
  frontmatter,
  themeCategory = 'light',
}: {
  frontmatter: Frontmatter | null;
  themeCategory?: 'light' | 'dark';
}) {
  if (!frontmatter) return null;

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

  // Author(s) formatting
  const authorList: string[] = [];
  if (author) authorList.push(String(author));
  if (Array.isArray(authors)) {
    authors.forEach((a) => {
      if (a && !authorList.includes(String(a))) authorList.push(String(a));
    });
  } else if (authors && !authorList.includes(String(authors))) {
    authorList.push(String(authors));
  }
  const displayAuthor = authorList.join(', ');

  // Catch-all extra dynamic fields
  const extraFields: { label: string; value: string }[] = [];

  // Known secondary keys to format cleanly if present
  if (publisher) extraFields.push({ label: 'Publisher', value: String(publisher) });
  if (edition) extraFields.push({ label: 'Edition', value: String(edition) });
  if (sourcePages) extraFields.push({ label: 'Source Pages', value: `${sourcePages} pages` });
  if (summaryType) extraFields.push({ label: 'Summary Type', value: String(summaryType) });

  // Add any additional dynamic frontmatter keys
  Object.entries(rest).forEach(([key, val]) => {
    if (val === undefined || val === null || val === '') return;
    let displayVal = '';
    if (Array.isArray(val)) {
      displayVal = val.map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v))).join(', ');
    } else if (typeof val === 'object') {
      displayVal = JSON.stringify(val);
    } else {
      displayVal = String(val);
    }
    extraFields.push({
      label: formatKeyToLabel(key),
      value: displayVal,
    });
  });

  return (
    <div
      data-pdf-frontmatter="true"
      className="mb-8 p-6 sm:p-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 backdrop-blur-md shadow-sm transition-colors"
    >
      {/* Top Badges & Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {category && (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
            {String(category)}
          </span>
        )}
        {status && (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {String(status)}
          </span>
        )}
        {readTime && (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5 ml-auto">
            <Icons.Clock className="w-3.5 h-3.5 text-slate-400" />
            {String(readTime)}
          </span>
        )}
      </div>

      {/* Main Title */}
      {title && (
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-2 leading-tight">
          {String(title)}
        </h1>
      )}

      {/* Subtitle */}
      {subtitle && (
        <h2 className="text-base sm:text-lg font-medium text-slate-700 dark:text-slate-300 mb-3 leading-snug">
          {String(subtitle)}
        </h2>
      )}

      {/* Main Description */}
      {description && (
        <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          {String(description)}
        </p>
      )}

      {/* Author, Date & Tags Row */}
      {(displayAuthor || date || (Array.isArray(tags) && tags.length > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
          <div className="flex flex-wrap items-center gap-4">
            {authorAvatar && (
              <img
                src={String(authorAvatar)}
                alt={displayAuthor || 'Author'}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
              />
            )}
            {displayAuthor && (
              <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                <Icons.User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{displayAuthor}</span>
              </div>
            )}
            {date && (
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <Icons.Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{String(date)}</span>
              </div>
            )}
          </div>

          {Array.isArray(tags) && tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Icons.Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {tags.map((tag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60 font-mono text-[11px]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Extensible Extra Frontmatter Fields Grid (NO TRUNCATION) */}
      {extraFields.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          {extraFields.map(({ label, value }) => (
            <div key={label} className="flex flex-col bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/40">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
                {label}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-200 break-words leading-snug">
                {value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

