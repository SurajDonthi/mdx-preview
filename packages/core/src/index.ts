export type {
  ThemeId,
  ThemeConfig,
  Frontmatter,
  HeaderItem,
  DocumentStats,
  MdxRenderMode,
  MdxThemeCategory,
  MdxExpressionMode,
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
  collectHeadings,
  extractHeadings,
  calculateDocumentStats,
} from './mdxParser';
export type { DocumentHeading } from './mdxParser';

export { parseMdxDocument, formatMdxParseError, countLines } from './mdxAst';
export type {
  MdxPoint,
  MdxParseError,
  MdxDiagnostic,
  MdxDocumentAst,
  MdxExpressionSlot,
  MdxExpressionSlotKind,
  ParseMdxOptions,
} from './mdxAst';

export { evaluateEstreeLiteral, createFullEstreeEvaluator } from './estreeEval';
export type {
  EstreeNodeLike,
  MdxExpressionResult,
  MdxExpressionEvaluator,
  FullEstreeEvaluatorOptions,
} from './estreeEval';
