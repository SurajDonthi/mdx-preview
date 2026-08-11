# MDX Studio Preview

A VS Code extension that previews `.mdx` files beside the editor, rendered with
this repository's own packages — `@mdxstudio/core` and `@mdxstudio/react`, plus
`@mdxstudio/mermaid`, `@mdxstudio/charts` and `@mdxstudio/flow` through the
plugin registry. Callouts, cards, tabs, steps, tables, charts, flow graphs,
Mermaid diagrams and syntax-highlighted code, themed to match the editor.

Opening an `.mdx` file opens the preview automatically. One panel is reused for
every document, and focus stays in the editor.

## Building

```sh
npm install                              # from the repository root
npm run build -w @mdxstudio/vscode       # -> apps/vscode/dist
npm run watch -w @mdxstudio/vscode       # rebuild on change
```

The build resolves `@mdxstudio/*` to `packages/*/src`, the same way
`apps/studio`'s Vite config does, so `npm run build:packages` does **not** have
to run first.

## Running it

Press <kbd>F5</kbd> with `apps/vscode` open as a folder (there is a launch
config), or from the repository root:

```sh
code --extensionDevelopmentPath="$PWD/apps/vscode" docs
```

Either way you get a second VS Code window titled *Extension Development Host*.
Open `docs/ARCHITECTURE.mdx` in it.

## Commands

| Command | Default keybinding | Where |
| --- | --- | --- |
| `MDX Studio: Open Preview to the Side` | <kbd>Ctrl</kbd>+<kbd>K</kbd> <kbd>V</kbd> | Editor title bar, command palette |
| `MDX Studio: Open Preview` | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> | <kbd>Alt</kbd>-click the title bar button, command palette |
| `MDX Studio: Refresh Preview` | — | Command palette |

The keybindings are the Markdown preview's own chords, scoped to `.mdx` so they
never take them away from a `.md` file.

The title bar button appears for `.md` as well — render a Markdown file through
this pipeline when you want its components and diagrams — but Markdown never
gets the automatic preview, because VS Code's own preview owns `.md`. The icon
is a book rather than a preview glyph: `markdown.showPreviewToSide` already uses
`$(open-preview)` and `markdown.reopenAsPreview` already uses `$(preview)`, and
all three buttons land in the same group.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `mdxstudio.expressions` | `full` | How much of an MDX `{...}` expression to evaluate. `full` needs `'unsafe-eval'` in the preview's CSP; `literals` does not. See below. |
| `mdxstudio.autoPreview` | `true` | Open the preview beside the editor whenever an `.mdx` file is opened. `.mdx` only. |
| `mdxstudio.preview.delay` | `300` | Milliseconds after the last keystroke before re-rendering. |
| `mdxstudio.preview.showFrontmatterHeader` | `true` | Render YAML frontmatter as a header card. |
| `mdxstudio.preview.scrollPreviewWithEditor` | `true` | Editor scrolls the preview. |
| `mdxstudio.preview.scrollEditorWithPreview` | `true` | Preview scrolls the editor. |

Scroll sync is anchored on the document's headings, interpolating between them,
and only reports back to the editor when you actually scrolled the preview
yourself.

## `unsafe-eval`, and why the default is what it is

A webview enforces exactly the content security policy its meta tag declares.
`@mdxstudio/core`'s full expression evaluator serialises each `{...}` back to
JavaScript and runs it through `new Function`, so without `'unsafe-eval'` every
expression in a document fails — not only body expressions but component props
too, which takes `<FlowGraph data={...}>`, `<Chart data={...}>`,
`<Tabs labels={...}>` and `<Mermaid chart={...}>` down with them.

So `'unsafe-eval'` is granted by default. The documents being previewed are the
user's own files, already trusted enough that VS Code runs their tasks and their
extensions.

Setting `mdxstudio.expressions` to `literals` switches the renderer to the
non-evaluating literal walker and rebuilds the page without `'unsafe-eval'`.
Every attribute in this repository's documents still works; what you lose is
expressions in the document *body* (`{2 + 2}`, `{items.map(...)}`). Changing the
setting reloads open previews, because a document's CSP is fixed once it loads.

Nothing else is granted: `default-src 'none'`, no `connect-src` at all, scripts
must carry the nonce, and images, fonts and media come from `webview.cspSource`,
`https:` or `data:`.

## Packaging

```sh
npx @vscode/vsce package
```

`"private": true` is set deliberately so nothing publishes this by accident;
drop it for a packaging run if `vsce` objects.
