<div align="center">

# mdxkit

**A React MDX renderer you can drop into an app — and the Studio that proves it works.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![npm workspaces](https://img.shields.io/badge/npm-workspaces-CB3837?logo=npm&logoColor=white)](https://docs.npmjs.com/cli/using-npm/workspaces)

[![MDX](https://img.shields.io/badge/parser-remark--mdx-1B1F24?logo=mdx&logoColor=white)](https://mdxjs.com)
[![Mermaid](https://img.shields.io/badge/Mermaid-11-FF3670?logo=mermaid&logoColor=white)](https://mermaid.js.org)
[![Recharts](https://img.shields.io/badge/Recharts-3-22B5BF)](https://recharts.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)

[![Backend](https://img.shields.io/badge/backend-none-success)](#)
[![Runs](https://img.shields.io/badge/runs-100%25%20client--side-success)](#)
[![CI](https://img.shields.io/badge/CI-Linux%20%2B%20Windows-success)](#)
[![License](https://img.shields.io/badge/license-MIT-success)](LICENSE)

</div>

Render MDX in the browser — markdown, real components, Mermaid diagrams, charts,
syntax-highlighted code and YAML frontmatter — either **in the page** or **inside an
isolated iframe** when the document is not yours.

There is **no backend**. Everything — parsing, rendering, PDF generation — runs in the
browser. The server only serves static files.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. The Studio seeds itself with four sample documents on first
run and stores everything in `localStorage`, so it is fully usable without signing in or
configuring anything.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000, bound to `0.0.0.0` |
| `npm run build` | Builds every package, then the app into `apps/studio/dist` |
| `npm run build:app` | The app only, resolving packages from source |
| `npm run preview` | Serve the built output |
| `npm run lint` | Type-check the whole workspace with `tsc --noEmit` |
| `npm run test` / `test:run` | Vitest, four projects: core, react, sandbox, studio |
| `npm run clean` | Remove build output from every workspace |

Requires Node 18+ (CI runs 22).

---

## The packages

The library is the point; the Studio is one consumer of it. Each package carries only
the dependencies it actually needs, so a host that wants callouts and code blocks does
not download a diagram engine to get them.

| Package | What it gives you |
| --- | --- |
| `@mdxkit/core` | The MDX parser, the expression evaluators, the plugin registry, shared types and the render context |
| `@mdxkit/react` | `MdxRenderer`, the built-in components, eight theme presets, the base stylesheet |
| `@mdxkit/mermaid` | `MermaidDiagram`, plus the plugin that takes over the ` ```mermaid ` fence |
| `@mdxkit/charts` | `Chart` — Recharts, imported on mount rather than with the page |
| `@mdxkit/flow` | `FlowGraph`, the interactive node/edge map used throughout these docs |
| `@mdxkit/pdf` | A4 export from a rendered DOM subtree |
| `@mdxkit/sandbox` | `SandboxedMdx` — render a document you did not write, in an opaque-origin frame |

### Composing them

Nothing is registered by default beyond the built-ins. The host decides:

```ts
import { createRendererRegistry } from '@mdxkit/react';
import { mermaidPlugin } from '@mdxkit/mermaid';
import { chartsPlugin } from '@mdxkit/charts';
import { flowPlugin } from '@mdxkit/flow';

// Module-level: MdxRenderer re-parses the document when the registry changes.
export const registry = createRendererRegistry(mermaidPlugin, chartsPlugin, flowPlugin);
```

```tsx
<MdxRenderer content={mdx} themeConfig={theme} registry={registry} />
```

A plugin contributes components, extra names for them (`Mermaid` for
`MermaidDiagram`), and fenced code languages it wants to render itself. Sources apply in
order and the last one wins, so passing your own component under a built-in name
replaces it. See `docs/ARCHITECTURE.mdx`.

### Rendering something you did not write

`MdxRenderer` evaluates a document's expressions **in your page, with your origin**.
That is right for a document the user typed and wrong for one an LLM produced or a
stranger pasted. Two ways down from there:

```tsx
// Restrict: only values the syntax spells out. No calls, no member access, no JSX.
<MdxRenderer content={mdx} themeConfig={theme} expressions="literals" />

// Isolate: full interactivity, opaque origin, no storage, no network.
<SandboxedMdx content={mdx} guestScript={guestScript} capabilities={{ submitLead }} />
```

The sandbox keeps every capability the document had and takes away everywhere it could
spend them: an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, a CSP
with `connect-src 'none'`, and a capability bridge that only calls handlers the host
registered by name.

---

## What the Studio does

- **Live preview** — markdown plus real JSX, re-rendered as you type. A half-typed
  document keeps the last good render behind a banner instead of blanking.
- **Custom components** — `Callout`, `Card`, `CardGrid`, `Stat`, `StatGrid`, `Tabs`,
  `Accordion`, `Timeline`, `Steps`, `Chart`, `Mermaid`, `FlowGraph` and more, usable
  directly from a document. See [docs/AUTHORING.mdx](docs/AUTHORING.mdx).
- **Mermaid diagrams** — fenced blocks or the `<Mermaid>` component.
- **Charts** — Recharts, driven by inline data.
- **Frontmatter** — YAML parsed into a header card; unknown keys render as extra fields.
- **Themes** — eight presets for the preview surface.
- **Table of contents** — built from the same parsed tree the renderer uses, so it never
  links at a heading that is not there. Scroll-spy, plus a mobile drawer.
- **PDF export** — A4 with page breaks measured to avoid splitting diagrams, headings
  and tables.
- **Persistence** — always `localStorage`; optionally Cloud Firestore and Google Drive.

---

## Configuration

The Studio works with zero configuration. Cloud features need a Firebase project,
supplied through `apps/studio/.env` — copy `apps/studio/.env.example`. See
**[docs/CONFIGURATION.mdx](docs/CONFIGURATION.mdx)** for the full walkthrough, including
the Firestore security rules, which **must be deployed** or every signed-in read and
write is denied.

Those values (API key, project id, app id) are **public identifiers by design** — they
are compiled into any client-side Firebase app and are not secrets. Access is controlled
by Firestore rules and authorized domains, not by hiding them. You should still restrict
the API key by HTTP referrer in the Google Cloud console.

---

## Documentation

The docs are written in MDX, because this app reads MDX. **Open them with the Upload
button** for callouts, tabs and interactive diagrams; GitHub renders them as plain text.

| Document | For |
| --- | --- |
| [docs/AUTHORING.mdx](docs/AUTHORING.mdx) | Writing documents: every component, and the two rules that will otherwise bite you |
| [docs/ARCHITECTURE.mdx](docs/ARCHITECTURE.mdx) | The packages, the registry, the render pipeline, the sandbox, the exporter |
| [docs/CONFIGURATION.mdx](docs/CONFIGURATION.mdx) | Firebase, Google Drive, Firestore rules, deployment |
| [docs/document-lifecycle-trace.mdx](docs/document-lifecycle-trace.mdx) | An audit of the document lifecycle as it stood before the monorepo split, with an interactive flow map |

---

## Tech stack

**Runtime** React 19 · TypeScript 5.8 · Vite 6 · npm workspaces. Tailwind CSS v4 styles
the Studio shell only — the `packages/*` ship plain CSS and have no framework dependency.

**Parsing and rendering** `remark-parse` + `remark-gfm` + `remark-mdx` +
`remark-rehype` produce a tree; `hast-util-to-jsx-runtime` turns it into React elements.
Expressions are evaluated through `estree-util-build-jsx` and `estree-util-to-js`.
`prismjs` · `mermaid` · `recharts` · `js-yaml` · `lucide-react`.

**Persistence** `localStorage` · Firebase Auth + Cloud Firestore · Google Drive REST v3

**Export** `jspdf` · SVG `foreignObject` capture, with `html2canvas` as a lazy fallback

**Sandbox** `esbuild` bundles the guest runtime to a single inlined script

> **This is standard MDX.** Documents are parsed with `remark-mdx` and rendered from the
> tree — nothing is compiled to JavaScript, and there is no hand-written scanner. Only
> the `{...}` expressions inside a document are evaluated. Two MDX behaviours still
> surprise people; both are in
> [docs/AUTHORING.mdx](docs/AUTHORING.mdx).

---

## Styling the packages

The `packages/*` ship plain CSS. Import each stylesheet once, anywhere in the
application — there is no framework, config file or build step to add:

```ts
import '@mdxkit/react/styles.css';    // renderer, markdown elements, built-in components
import '@mdxkit/mermaid/styles.css';  // diagram card chrome
import '@mdxkit/charts/styles.css';   // chart card chrome
import '@mdxkit/flow/styles.css';     // flow map chrome and SVG palette
```

**Theme comes from the application, not the operating system.** `MdxRenderer` stamps
`data-mdxkit-theme="light" | "dark"` on its root from `themeConfig.category`, and every
themed rule keys off that attribute. `prefers-color-scheme` is never consulted; a host
that wants OS-following behaviour opts in by setting the attribute from a media query
itself. The attribute lives on the renderer's own root rather than on `:root` so the PDF
exporter's detached clone still resolves it.

**Retheme by overriding custom properties, not by forking components.** Every colour,
radius, spacing step and font stack is a `--mdxkit-*` property. Set them on any ancestor:

```css
.my-docs {
  --mdxkit-accent: #0f766e;
  --mdxkit-surface-base: #fffaf3;
  --mdxkit-radius-2xl: 0;
  --mdxkit-font-body: ui-serif, Georgia, serif;
}
```

A `ThemeConfig` preset carries its own overrides in `cssVars`, which the renderer applies
to its root as inline custom properties.

---

## Project layout

```
packages/
  core/      types · frontmatter · headings · MDX parser · expression evaluators · registry
  react/     MdxRenderer · built-in components · themes · styles.css
  mermaid/   MermaidDiagram · the mermaid fence plugin
  charts/    Chart, backed by Recharts and loaded on demand
  flow/      FlowGraph
  pdf/       pdfExporter: A4 capture, page-break measurement, jsPDF output
  sandbox/   host component · guest runtime · wire protocol · esbuild and Vite build helpers
apps/
  studio/
    src/App.tsx              all document state; the 400ms auto-save that fans out
    src/mdxRegistry.ts       which components this app registers
    src/components/          editor, sidebar, navbar, TOC, modals, toasts
    src/utils/               storage · firestoreService · driveService · auth · toast
    src/data/sampleMDX.ts    the four seeded documents
    firestore.rules          deploy this, or every signed-in read is denied
docs/
```

---

## Known limitations

- **PDF output is a raster image**, so text in the PDF is not selectable or searchable.
  `exportHtmlToPdfVector` is an alias of the canvas exporter, not a second engine.
- **Sync conflict resolution is last-writer-wins** on a client clock. There is no merge
  UI; a document edited on two devices while both are offline will lose one side.
- **`expressions` defaults to `'full'`**, which is the right default for an author's own
  documents and the wrong one for anything else. Nothing forces a host to think about it.
- **`@mdxkit/sandbox` is not wired into the Studio.** It is complete and tested, but no
  application in this repository mounts it yet.
- **The Studio ships as one large JavaScript chunk** (about 4 MB uncompressed, ~1 MB
  gzipped). Mermaid's diagram types and Recharts code-split themselves; the renderer,
  Prism, Firebase and the app do not. `npm run build` prints the current figures.

---

## License

MIT. See [LICENSE](LICENSE).
