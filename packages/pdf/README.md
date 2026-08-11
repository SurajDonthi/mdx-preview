# @mdxstudio/pdf

Exports an already-rendered MDX document from the DOM to an A4 PDF, paginating
between block elements rather than through them instead of slicing the page at a
fixed offset.

Browser only — it reads live layout out of the DOM.

## Install

```sh
npm install @mdxstudio/pdf
```

No peer dependencies; no React; no stylesheet. `jspdf` and `html2canvas` are
ordinary dependencies, and both are loaded with a dynamic `import()`: nothing in
this package is in your first-load bundle until an export actually runs, and
`html2canvas` only if the native capture path refuses. A document that is opened
and never exported costs a few KB rather than several hundred.

## Usage

Render the document with `renderMode="pdf"` into an off-screen container, then
hand the element over:

```ts
import { exportToPdf, downloadMdxFile } from '@mdxstudio/pdf';

// `source` is the rendered element (or its id); the title names the file.
await exportToPdf(document.getElementById('doc')!, 'Release notes');

downloadMdxFile(mdxSource, 'Release notes');
```

## Exports

`exportToPdf`, `exportHtmlToPdf`, `exportHtmlToPdfVector`, `exportHtmlToPdfCanvas`
(the last three are aliases of the same exporter, kept for callers that named the
older engines), `createWhitePaperContainer`,
`sanitizeClonedDocumentForHtml2Canvas`, `parseCssColorToRgb`, `downloadMdxFile`,
and the `PdfExportEngine` type.

ESM only, with TypeScript declarations.

## License

MIT
