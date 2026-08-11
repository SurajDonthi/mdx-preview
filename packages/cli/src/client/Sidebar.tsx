import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronRight, FileText, Folder, FolderOpen, Search, X } from 'lucide-react';

import type { DocEntry } from '../protocol';
import { buildTree, directoryPaths, filterDocs } from './tree';
import type { TreeNode } from './tree';

interface SidebarProps {
  docs: DocEntry[];
  current: string;
  label: string;
  onSelect: (path: string) => void;
  onClose?: () => void;
}

/**
 * The whole reason `serve` exists: every document in the folder, one click
 * away, without going back to the terminal.
 */
export function Sidebar({ docs, current, label, onSelect, onClose }: SidebarProps) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const visible = useMemo(() => filterDocs(docs, query), [docs, query]);
  const tree = useMemo(() => buildTree(visible), [visible]);

  // While filtering, every folder opens: hiding a match behind a closed folder
  // is the one thing a search must never do.
  const searching = query.trim() !== '';
  const openPaths = useMemo(
    () => (searching ? new Set(directoryPaths(tree)) : null),
    [searching, tree]
  );

  const isOpen = (dirPath: string): boolean => openPaths?.has(dirPath) ?? !collapsed.has(dirPath);

  const toggle = (dirPath: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(dirPath)) next.delete(dirPath);
      else next.add(dirPath);
      return next;
    });
  };

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'dir') {
        const open = isOpen(node.path);
        return (
          <li key={`dir:${node.path}`}>
            <button
              type="button"
              className="mdxcli-tree__row mdxcli-tree__row--dir"
              style={{ paddingInlineStart: `${8 + depth * 12}px` }}
              aria-expanded={open}
              onClick={() => toggle(node.path)}
            >
              <ChevronRight
                className={`mdxcli-tree__chevron${open ? ' mdxcli-tree__chevron--open' : ''}`}
                aria-hidden="true"
              />
              {open ? (
                <FolderOpen className="mdxcli-tree__icon" aria-hidden="true" />
              ) : (
                <Folder className="mdxcli-tree__icon" aria-hidden="true" />
              )}
              <span className="mdxcli-tree__label">{node.name}</span>
            </button>
            {open && <ul className="mdxcli-tree__list">{renderNodes(node.children, depth + 1)}</ul>}
          </li>
        );
      }

      const active = node.path === current;
      return (
        <li key={`doc:${node.path}`}>
          <a
            href={`/${node.path.split('/').map(encodeURIComponent).join('/')}`}
            className={`mdxcli-tree__row mdxcli-tree__row--doc${active ? ' is-active' : ''}`}
            style={{ paddingInlineStart: `${8 + depth * 12}px` }}
            aria-current={active ? 'page' : undefined}
            title={node.path}
            data-doc-path={node.path}
            onClick={(event) => {
              // A real href keeps middle-click and "copy link" working; the
              // handler only takes over the plain left click.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onSelect(node.path);
            }}
          >
            <FileText className="mdxcli-tree__icon" aria-hidden="true" />
            <span className="mdxcli-tree__label">{node.doc.title}</span>
          </a>
        </li>
      );
    });

  return (
    <div className="mdxcli-sidebar__inner">
      <div className="mdxcli-sidebar__head">
        <div className="mdxcli-sidebar__title" title={label}>
          {label}
        </div>
        <span className="mdxcli-sidebar__count">{docs.length}</span>
        {onClose && (
          <button type="button" className="mdxcli-iconbutton mdxcli-only-narrow" onClick={onClose} aria-label="Close file list">
            <X className="mdxcli-icon" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="mdxcli-search">
        <Search className="mdxcli-search__icon" aria-hidden="true" />
        <input
          type="search"
          className="mdxcli-search__input"
          placeholder="Filter documents"
          aria-label="Filter documents"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <nav className="mdxcli-tree" aria-label="Documents">
        {visible.length === 0 ? (
          <p className="mdxcli-tree__empty">
            {docs.length === 0 ? 'No .mdx or .md files here.' : `Nothing matches "${query}".`}
          </p>
        ) : (
          <ul className="mdxcli-tree__list">{renderNodes(tree, 0)}</ul>
        )}
      </nav>
    </div>
  );
}
