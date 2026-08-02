import { useState } from 'react';
import * as Icons from 'lucide-react';
import { ViewMode, ThemeId, DocumentStats } from '../types';
import { ThemeSelector } from './ThemeSelector';

interface NavbarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  currentDocumentTitle: string;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  currentThemeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  stats: DocumentStats;
  onOpenUpload: () => void;
  onOpenExport: () => void;
  onOpenMobileToc: () => void;
}

export function Navbar({
  sidebarOpen,
  onToggleSidebar,
  currentDocumentTitle,
  viewMode,
  onViewModeChange,
  currentThemeId,
  onThemeChange,
  stats,
  onOpenUpload,
  onOpenExport,
  onOpenMobileToc,
}: NavbarProps) {
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 text-slate-100 shrink-0 select-none">
      <div className="w-full px-4 h-14 flex items-center justify-between gap-3">
        {/* Left Section: Sidebar Toggle & App Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleSidebar}
            className={`p-2 rounded-xl transition-colors ${
              sidebarOpen
                ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
            title={sidebarOpen ? 'Hide Sidebar' : 'Show File Sidebar'}
          >
            <Icons.PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 font-bold text-base tracking-tight text-white shrink-0">
            <div className="p-1.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-md">
              <Icons.Sparkles className="w-4 h-4" />
            </div>
            <span className="hidden sm:inline font-semibold">MDX Studio</span>
          </div>

          <div className="h-4 w-px bg-slate-800 hidden sm:block shrink-0" />

          {/* Current Document Name Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-medium text-slate-300 truncate max-w-[160px] sm:max-w-[220px]">
            <Icons.FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">{currentDocumentTitle}</span>
          </div>
        </div>

        {/* Center Section: View Mode Toggle Buttons (Code / Split / Preview) */}
        <div className="flex items-center p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs shadow-inner">
          <button
            onClick={() => onViewModeChange('editor')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              viewMode === 'editor'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Editor Only"
          >
            <Icons.Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Code</span>
          </button>

          <button
            onClick={() => onViewModeChange('split')}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              viewMode === 'split'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Split View (Code + Preview)"
          >
            <Icons.Columns2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Split</span>
          </button>

          <button
            onClick={() => onViewModeChange('preview')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
              viewMode === 'preview'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Preview Only"
          >
            <Icons.Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>
        </div>

        {/* Right Section: Header Actions (Upload, Export, Theme, Mobile TOC) */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Document Stats Pill (Desktop) */}
          <div className="hidden lg:flex items-center gap-2.5 text-xs text-slate-400 font-mono bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
            <span>{stats.words} words</span>
            <span>•</span>
            <span>{stats.readingTimeMinutes}m read</span>
          </div>

          {/* Upload Button */}
          <button
            onClick={onOpenUpload}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700/60 transition-colors cursor-pointer"
            title="Upload Local File (.md, .mdx)"
          >
            <Icons.Upload className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden md:inline">Upload</span>
          </button>

          {/* Theme Selector Popover */}
          <div className="relative">
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700/60 transition-colors cursor-pointer"
              title="Change MDX Preview Theme"
            >
              <Icons.Palette className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden lg:inline">Theme</span>
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-2 z-50 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2 text-xs">
                <div className="px-3 py-1 font-semibold text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800 mb-2">
                  Select Theme Preset
                </div>
                <ThemeSelector
                  currentThemeId={currentThemeId}
                  onSelectTheme={(id) => {
                    onThemeChange(id);
                    setShowThemeMenu(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Export / Download / PDF Modal Trigger */}
          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer shrink-0"
            title="Export / Print / Download PDF / MDX"
          >
            <Icons.Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>

          {/* Mobile TOC Trigger */}
          <button
            onClick={onOpenMobileToc}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 lg:hidden"
            title="Open Table of Contents"
          >
            <Icons.List className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
