export type {
  ThemeId,
  ThemeConfig,
  Frontmatter,
  HeaderItem,
  DocumentStats,
} from '@mdxstudio/core';

export interface MdxDocSample {
  id: string;
  title: string;
  description: string;
  category: string;
  iconName: string;
  content: string;
}

export type ViewMode = 'split' | 'preview' | 'editor';
