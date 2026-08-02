export type ThemeId =
  | 'frosted-glass'
  | 'github-light'
  | 'github-dark'
  | 'dracula'
  | 'nord'
  | 'editorial'
  | 'cyberpunk'
  | 'forest';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  category: 'light' | 'dark';
  fontFamily: string;
  bgClass: string;
  textClass: string;
  headingClass: string;
  cardBgClass: string;
  borderClass: string;
  codeBgClass: string;
  codeTextClass: string;
  accentClass: string;
  primaryButtonClass: string;
  badgeClass: string;
  previewBg: string;
  previewText: string;
  headingFont?: string;
}

export interface Frontmatter {
  title?: string;
  description?: string;
  author?: string;
  authorAvatar?: string;
  date?: string;
  tags?: string[];
  category?: string;
  status?: string;
  readTime?: string;
  [key: string]: unknown;
}

export interface HeaderItem {
  id: string;
  text: string;
  level: number; // 1, 2, 3, 4
}

export interface MdxDocSample {
  id: string;
  title: string;
  description: string;
  category: string;
  iconName: string;
  content: string;
}

export type ViewMode = 'split' | 'preview' | 'editor';

export interface DocumentStats {
  words: number;
  characters: number;
  readingTimeMinutes: number;
  headingsCount: number;
}
