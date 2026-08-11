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

export { MDX_CONFIG_FILENAMES, configSource, loadMdxConfig } from './mdxConfig';
export type {
  MdxConfigContext,
  MdxConfigShape,
  LoadedMdxConfig,
  LoadMdxConfigOptions,
} from './mdxConfig';

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
  MdxPipelineOptions,
  ParseMdxOptions,
} from './mdxAst';

export { MATH_COMPONENT } from './mathSyntax';

export { collectScrollAnchors, offsetForLine, lineForOffset } from './scrollSync';
export type { ScrollAnchor, ScrollAnchorOptions } from './scrollSync';

export { evaluateEstreeLiteral, createFullEstreeEvaluator } from './estreeEval';
export type {
  EstreeNodeLike,
  MdxExpressionResult,
  MdxExpressionEvaluator,
  FullEstreeEvaluatorOptions,
} from './estreeEval';
