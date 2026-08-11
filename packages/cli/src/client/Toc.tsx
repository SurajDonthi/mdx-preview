import { useEffect, useState } from 'react';
import { ListOrdered, X } from 'lucide-react';

import type { HeaderItem } from '@mdxstudio/core';

interface TocProps {
  headings: HeaderItem[];
  /** The element the document scrolls inside, for scroll-spy. */
  scrollRoot: HTMLElement | null;
  onSelect: (id: string) => void;
  onClose?: () => void;
}

/**
 * On this page. The same idea as the Studio's table of contents, rebuilt here
 * because that one is written in Tailwind utilities and this client ships plain
 * CSS - the CLI must not need a build step in the folder it is reading.
 */
export function Toc({ headings, scrollRoot, onSelect, onClose }: TocProps) {
  const [activeId, setActiveId] = useState('');

  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { root: scrollRoot ?? null, rootMargin: '-72px 0px -60% 0px' }
    );

    for (const heading of headings) {
      const element = document.getElementById(heading.id);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [headings, scrollRoot]);

  return (
    <div className="mdxcli-toc__inner">
      <div className="mdxcli-toc__head">
        <ListOrdered className="mdxcli-icon" aria-hidden="true" />
        <span>On this page</span>
        {onClose && (
          <button type="button" className="mdxcli-iconbutton" onClick={onClose} aria-label="Close outline">
            <X className="mdxcli-icon" aria-hidden="true" />
          </button>
        )}
      </div>

      {headings.length === 0 ? (
        <p className="mdxcli-toc__empty">No headings.</p>
      ) : (
        <nav className="mdxcli-toc__list" aria-label="On this page">
          {headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              className={`mdxcli-toc__item${activeId === heading.id ? ' is-active' : ''}`}
              style={{ paddingInlineStart: `${8 + (Math.min(heading.level, 4) - 1) * 10}px` }}
              onClick={() => {
                onSelect(heading.id);
                onClose?.();
              }}
            >
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
