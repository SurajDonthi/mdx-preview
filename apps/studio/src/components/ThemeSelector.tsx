import { ThemeId } from '../types';
import { THEMES } from '@mdxstudio/react';
import * as Icons from 'lucide-react';

interface ThemeSelectorProps {
  currentThemeId: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  compact?: boolean;
}

export function ThemeSelector({
  currentThemeId,
  onSelectTheme,
  compact = false,
}: ThemeSelectorProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full no-scrollbar">
        {Object.values(THEMES).map((theme) => {
          const isActive = theme.id === currentThemeId;
          return (
            <button
              key={theme.id}
              onClick={() => onSelectTheme(theme.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all shrink-0 ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full border border-black/20"
                style={{ backgroundColor: theme.previewBg }}
              />
              <span>{theme.name}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-1">
      {Object.values(THEMES).map((theme) => {
        const isActive = theme.id === currentThemeId;
        return (
          <button
            key={theme.id}
            onClick={() => onSelectTheme(theme.id)}
            className={`flex items-center justify-between p-3 rounded-xl border text-left transition-all ${
              isActive
                ? 'border-indigo-600 dark:border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span
                className="w-4 h-4 rounded-full border border-black/20 shrink-0"
                style={{ backgroundColor: theme.previewBg }}
              />
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                {theme.name}
              </span>
            </div>
            {isActive && <Icons.Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}
