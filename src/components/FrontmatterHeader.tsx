import { Frontmatter } from '../types';
import * as Icons from 'lucide-react';

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
    ...rest
  } = frontmatter;

  // Determine author display string (support single author or authors array)
  const displayAuthor = author
    ? String(author)
    : Array.isArray(authors)
    ? authors.join(', ')
    : authors
    ? String(authors)
    : null;

  // Filter out empty standard values from extra fields
  const extraFields = Object.entries(rest).map(([key, val]) => {
    if (val === undefined || val === null) return null;
    let displayVal = '';
    if (Array.isArray(val)) {
      displayVal = val.join(', ');
    } else if (typeof val === 'object') {
      displayVal = JSON.stringify(val);
    } else {
      displayVal = String(val);
    }
    return [key, displayVal] as [string, string];
  }).filter(Boolean) as [string, string][];

  return (
    <div className="mb-8 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/70 backdrop-blur-md shadow-xs">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {category && (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            {String(category)}
          </span>
        )}
        {status && (
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {String(status)}
          </span>
        )}
        {readTime && (
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 ml-auto">
            <Icons.Clock className="w-3.5 h-3.5" />
            {String(readTime)}
          </span>
        )}
      </div>

      {title && (
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-1 leading-tight">
          {String(title)}
        </h1>
      )}

      {subtitle && (
        <h2 className="text-base sm:text-lg font-medium text-slate-600 dark:text-slate-300 mb-3">
          {String(subtitle)}
        </h2>
      )}

      {description && (
        <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
          {String(description)}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-200/60 dark:border-slate-800/60 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          {authorAvatar && (
            <img
              src={String(authorAvatar)}
              alt={String(displayAuthor || 'Author')}
              className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
            />
          )}
          {displayAuthor && (
            <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
              <Icons.User className="w-3.5 h-3.5 text-slate-400" />
              <span>{displayAuthor}</span>
            </div>
          )}
          {date && (
            <div className="flex items-center gap-1.5">
              <Icons.Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{String(date)}</span>
            </div>
          )}
        </div>

        {Array.isArray(tags) && tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Icons.Tag className="w-3.5 h-3.5 text-slate-400" />
            {tags.map((tag, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md bg-slate-200/60 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 font-mono text-[11px]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {extraFields.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200/40 dark:border-slate-800/40 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {extraFields.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[10px] uppercase font-mono text-slate-400">{k}</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                {String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
