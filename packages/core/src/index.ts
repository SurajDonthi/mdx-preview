export type {
  ThemeId,
  ThemeConfig,
  Frontmatter,
  HeaderItem,
  DocumentStats,
  MdxRenderMode,
  MdxThemeCategory,
  MdxRenderSettings,
} from './types';

export { MdxRenderContext } from './context';

export {
  defineMdxPlugin,
  createMdxRegistry,
  emptyMdxRegistry,
} from './registry';
export type {
  MdxComponent,
  MdxComponentMap,
  MdxPlugin,
  MdxRegistrySource,
  MdxRegistry,
} from './registry';

export {
  parseFrontmatter,
  slugify,
  extractHeadings,
  calculateDocumentStats,
} from './mdxParser';
