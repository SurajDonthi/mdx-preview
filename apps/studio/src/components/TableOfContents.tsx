import React, { useEffect, useState } from 'react';
import { HeaderItem } from '../types';
import * as Icons from 'lucide-react';

interface TableOfContentsProps {
  headings: HeaderItem[];
  activeId?: string;
  onSelectHeader: (id: string) => void;
  variant?: 'desktop' | 'drawer';
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  className?: string;
}

export function TableOfContents({
  headings,
  activeId,
  onSelectHeader,
  variant = 'desktop',
  isOpenMobile,
  onCloseMobile,
  className = '',
}: TableOfContentsProps) {
  const [internalActiveId, setInternalActiveId] = useState<string>('');

  const currentActive = activeId || internalActiveId;

  // Auto scroll-spy if activeId is not controlled externally
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setInternalActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: '-80px 0px -60% 0px' }
    );

    // A heading is not a fixed element: a section a reader collapsed takes its
    // headings off the page and puts *new* ones back when it opens again, as
    // does switching a <Tabs> panel. An observer still holding the old node
    // never fires for it, so the outline would latch on whatever was
    // highlighted last. Comparing what is found keeps this to a lookup per
    // heading while the editor types.
    let watched: HTMLElement[] = [];

    const attach = () => {
      const found = headings
        .map((h) => document.getElementById(h.id))
        .filter((el): el is HTMLElement => el !== null);

      const same =
        found.length === watched.length && found.every((el, index) => el === watched[index]);
      if (same) return;

      watched = found;
      observer.disconnect();
      found.forEach((el) => observer.observe(el));
    };

    attach();
    const mutations = new MutationObserver(attach);
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [headings]);

  const content = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-3">
        <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Icons.ListOrdered className="w-4 h-4 text-indigo-500" />
          <span>On This Page ({headings.length})</span>
        </div>
        {onCloseMobile && (
          <button
            onClick={onCloseMobile}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 sm:hidden"
          >
            <Icons.X className="w-5 h-5" />
          </button>
        )}
      </div>

      {headings.length === 0 ? (
        <div className="text-xs text-slate-400 italic py-4 text-center">
          No headings found in document. Add `# Heading` to see table of contents.
        </div>
      ) : (
        <nav className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {headings.map((item) => {
            const isActive = currentActive === item.id;
            const levelPadding =
              item.level === 1
                ? 'pl-2'
                : item.level === 2
                ? 'pl-5'
                : item.level === 3
                ? 'pl-8'
                : 'pl-11';

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectHeader(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full text-left text-xs py-1.5 px-2 rounded-lg transition-all duration-150 block truncate ${levelPadding} ${
                  isActive
                    ? 'font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-l-2 border-indigo-600 dark:border-indigo-400'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                }`}
              >
                {item.text}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );

  if (variant === 'desktop') {
    return (
      <aside
        className={`hidden lg:block w-64 min-w-0 shrink-0 p-4 border-l border-slate-200/80 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/50 h-full ${className}`}
        data-testid="desktop-toc"
      >
        {content}
      </aside>
    );
  }

  if (!isOpenMobile) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden flex justify-end" data-testid="mobile-toc-drawer">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onCloseMobile}
      />
      <aside className="relative w-80 max-w-[85vw] h-full min-h-0 bg-white dark:bg-slate-900 p-5 shadow-2xl z-10 border-l border-slate-200 dark:border-slate-800 flex flex-col">
        {content}
      </aside>
    </div>
  );
}
