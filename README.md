<div align="center">

# MDX Studio &amp; Live Viewer

**Write MDX in the browser and watch it render as you type.**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

[![Mermaid](https://img.shields.io/badge/Mermaid-11-FF3670?logo=mermaid&logoColor=white)](https://mermaid.js.org)
[![Recharts](https://img.shields.io/badge/Recharts-3-22B5BF)](https://recharts.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)
[![Google Drive](https://img.shields.io/badge/Google%20Drive-REST%20v3-4285F4?logo=googledrive&logoColor=white)](https://developers.google.com/drive)

[![Backend](https://img.shields.io/badge/backend-none-success)](#)
[![Runs](https://img.shields.io/badge/runs-100%25%20client--side-success)](#)
[![PDF export](https://img.shields.io/badge/PDF%20export-A4%2C%20offline-success)](#)
[![Mobile](https://img.shields.io/badge/mobile-supported-success)](#)
[![License](https://img.shields.io/badge/license-none%20yet-lightgrey)](#license)

</div>

React components, Mermaid diagrams, charts, syntax-highlighted code and YAML
frontmatter — with optional sync to Google Drive and Firestore, and a one-click A4
PDF export.

There is **no backend**. Everything — parsing, compiling, rendering, PDF generation —
runs in the browser. The server only serves static files.

---

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. The app seeds itself with four sample documents on first
run and stores everything in `localStorage`, so it is fully usable without signing in
or configuring anything.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 3000, bound to `0.0.0.0` |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built output |
| `npm run lint` | Type-check with `tsc --noEmit` |
| `npm run clean` | Remove `dist/` |

Requires Node 18+.

---

## What it does

- **Live MDX preview** — markdown plus real JSX, compiled and re-rendered as you type,
  with an error boundary so a half-typed tag doesn't blank the page.
- **Custom components** — `Callout`, `Card`, `CardGrid`, `Stat`, `StatGrid`, `Tabs`,
  `Accordion`, `Timeline`, `Steps`, `Chart`, `Mermaid`, `FlowGraph` and more, usable
  directly from a document. See [docs/AUTHORING.md](docs/AUTHORING.md).
- **Mermaid diagrams** — fenced blocks or the `<Mermaid>` component.
- **Charts** — Recharts, driven by inline data.
- **Frontmatter** — YAML parsed into a header card; unknown keys render as extra fields.
- **Themes** — several preset themes for the preview surface.
- **Table of contents** — extracted from headings, with scroll-spy, plus a mobile drawer.
- **PDF export** — A4 output with page breaks that avoid splitting diagrams, headings
  and tables.
- **Persistence** — always `localStorage`; optionally Cloud Firestore and Google Drive.

---

## Configuration

The app works with zero configuration. Cloud features need a Firebase project — see
**[docs/CONFIGURATION.md](docs/CONFIGURATION.md)** for the full walkthrough, including
the Firestore security rules, which **must be deployed** or every signed-in read and
write is denied.

`firebase-applet-config.json` at the repo root holds the Firebase web config. Those
values (API key, project id, app id, OAuth client id) are **public identifiers by
design** — they are compiled into any client-side Firebase app and are not secrets.
Access is controlled by Firestore rules and authorized domains, not by hiding them.
You should still restrict the API key by HTTP referrer in the Google Cloud console.

---

## Documentation

The docs are written in MDX, because this app reads MDX. **Open them with the Upload
button** for callouts, tabs and interactive diagrams; GitHub renders them as plain text.

| Document | For |
| --- | --- |
| [docs/AUTHORING.mdx](docs/AUTHORING.mdx) | Writing documents: every component, and the parser gotchas that will bite you |
| [docs/ARCHITECTURE.mdx](docs/ARCHITECTURE.mdx) | How the renderer, persistence and PDF export actually work |
| [docs/CONFIGURATION.mdx](docs/CONFIGURATION.mdx) | Firebase, Google Drive, Firestore rules, deployment |
| [docs/document-lifecycle-trace.mdx](docs/document-lifecycle-trace.mdx) | A traced audit of the document lifecycle, with an interactive flow map |

---

## Tech stack

**Runtime** React 19 · TypeScript 5.8 · Vite 6 · Tailwind CSS v4

**Rendering** `@babel/standalone` (compiles JSX at runtime) · `react-markdown` +
`remark-gfm` · `prismjs` · `mermaid` · `recharts` · `js-yaml` · `lucide-react` · `motion`

**Persistence** `localStorage` · Firebase Auth + Cloud Firestore · Google Drive REST v3

**Export** `jspdf` · SVG `foreignObject` capture, with `html2canvas` as a fallback

> **This is not standard MDX.** There is no `@mdx-js` anywhere. Documents are split into
> markdown and JSX chunks by a hand-written scanner and the JSX is compiled at runtime
> with Babel. That has real consequences for what you can write — read
> [docs/AUTHORING.md](docs/AUTHORING.md) before authoring anything non-trivial.

---

## Project layout

```
src/
  App.tsx                  all document state; the 400ms auto-save that fans out
  components/
    MdxRenderer.tsx        the parser + Babel compile + render pipeline
    CustomComponents.tsx   every component a document can use (mdxComponentsMap)
    MermaidDiagram.tsx     diagram rendering; also exports MdxRenderContext
    FlowGraph.tsx          interactive node/edge diagram with a flows panel
    FrontmatterHeader.tsx  the frontmatter card
    InlineToken.tsx        shared geometry for tag and inline-code pills
    MdxEditor.tsx  FileSidebar.tsx  TableOfContents.tsx  Navbar.tsx
    ExportModal.tsx  GoogleDriveModal.tsx  FileUploadModal.tsx  ToastContainer.tsx
  utils/
    mdxParser.ts           frontmatter split, heading extraction, slugs, stats
    storage.ts             localStorage, id generation, merge policy, tombstones
    firestoreService.ts    per-user document subcollection + live subscription
    driveService.ts        Google Drive REST v3
    auth.ts                Firebase auth and the cached Drive token
    pdfExporter.ts         A4 export
  data/
    sampleMDX.ts           the four seeded documents
    themes.ts              preview themes
```

---

## Known limitations

- **`dark:` classes follow the operating system, not the theme picker.** Tailwind v4
  defaults the `dark` variant to `prefers-color-scheme`, and this project declares no
  custom `dark` variant and never sets a `dark` class. The theme selector changes the
  preview surface; the hundreds of `dark:` utilities in components do not follow it.
- **The preview pane scrolls sideways on narrow screens** for documents containing wide
  tables or many tabs. The page itself does not.
- **PDF output is a raster image**, so text in the PDF is not selectable or searchable.
- **Sync conflict resolution is last-writer-wins** on a client clock. There is no
  merge UI; a document edited on two devices while both are offline will lose one side.
- **`package-lock.json` was generated on Linux** and contains no Windows native
  binaries, so `npm ci` on Windows produces a `node_modules` that cannot build. Use
  `npm install` there.

---

## License

No license file is present. Add one before publishing this repository for reuse.
