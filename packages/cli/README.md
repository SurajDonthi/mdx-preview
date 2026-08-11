# @mdxstudio/cli

Read a folder of MDX documents in your browser. Point it at a directory, get a
sidebar of everything in it, and edits show up without a refresh.

```bash
npx @mdxstudio/cli serve ./docs
```

No install, no config, no build step in the folder you are reading — it does not
need to be a JavaScript project at all.

## Commands

```bash
mdxstudio serve [dir]          # default '.'
mdxstudio ./docs               # a bare path implies serve
mdxstudio open <file>          # one document
cat draft.mdx | mdxstudio open -   # from stdin
```

| Flag | |
| --- | --- |
| `-p, --port <n>` | Default 4321. Without this it walks forward to the next free port; with it, a taken port is an error. |
| `-H, --host[=addr]` | Bare `--host` binds `0.0.0.0`. An explicit address needs the `=`. |
| `-o, --open` / `--no-open` | Open a browser. |
| `--no-watch` | Stop watching for changes. |
| `--no-gitignore` | Include files `.gitignore` excludes. |
| `--expressions full\|literals` | See below. |
| `--theme <id>` | One of the built-in theme presets. |

## What you get

- **A sidebar** of every `.mdx` and `.md` under the directory, with a filter box.
  `.gitignore` is respected and `node_modules` is skipped.
- **Live reload** — editing, adding, renaming or deleting a file updates the page.
- **The full component set**: Mermaid diagrams, Recharts charts, `FlowGraph`,
  callouts, tabs, accordions, timelines, frontmatter headers, and a scroll-spy
  table of contents.
- **Readable on a phone** — pass `--host` and open the LAN URL it prints.

Starts in about 250 ms; the client is prebuilt, so nothing compiles on startup.

## Expressions

MDX documents can contain JavaScript expressions, and rendering them means
evaluating them. Serving a repository you already trust as much as its code,
`full` is the sensible default and is what you get.

```bash
mdxstudio serve ./docs --expressions literals
```

`literals` restricts evaluation to values the syntax spells out — no calls, no
member access. Worth using for a folder you have not read, which matters more
once `--host` puts it on your network.

## Related

- [`@mdxstudio/react`](https://www.npmjs.com/package/@mdxstudio/react) — the renderer this is built on
- [`@mdxstudio/agent-skill`](https://www.npmjs.com/package/@mdxstudio/agent-skill) — teach a coding agent to write documents in this flavour

MIT.
