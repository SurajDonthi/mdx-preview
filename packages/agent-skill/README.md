# @mdxstudio/agent-skill

Teaches any coding agent to write documentation as `.mdx` in the MDX Studio
flavour instead of plain markdown.

Installing does **two** things, and it needs both to work:

1. **Places the `mdx-docs` skill** — a `SKILL.md` plus four reference files
   covering the component catalogue, Mermaid, `FlowGraph`, and how to extend the
   registry.
2. **Inserts a short policy block** into the agent's instruction file
   (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, …), wrapped in sentinel comments so it
   can be updated and removed exactly.

The skill is reference material an agent loads when it decides it is relevant.
The policy block is what makes it decide that. A skill on its own changes
nothing.

## Use

```sh
npx @mdxstudio/agent-skill add              # home directory, agents detected
npx @mdxstudio/agent-skill add --project    # this repository
npx @mdxstudio/agent-skill remove           # undoes either, cleanly
npx @mdxstudio/agent-skill list             # every agent and the paths it uses
```

| Flag | Effect |
| --- | --- |
| `--project` | Operate on the working directory instead of the home directory |
| `--global` | Operate on the home directory (the default) |
| `--agent <ids>` | Comma-separated agent ids; repeatable |
| `--all` | Every known agent |
| `--force` | Replace a skill directory whose contents differ |
| `--dry-run` | Print exactly what would change; touch nothing |

Exit codes: `0` applied or nothing to do, `1` bad arguments or no agent could be
chosen, `2` something was skipped or failed.

## Which agent gets it

With `--agent`, exactly those. With `--all`, all of them. Otherwise the
instruction files **already present** are detected and used — a repository
holding both `CLAUDE.md` and `.github/copilot-instructions.md` gets both.

If nothing is detected:

- `--project` falls back to `AGENTS.md`, the cross-agent standard.
- `--global` **fails** and asks you to name an agent.

That asymmetry is the thing people get wrong, so it is worth stating plainly:

> **The AGENTS.md standard defines a repository file only.** There is no
> user-level `AGENTS.md`. Every global path below is a per-vendor invention, so
> a global install has nothing safe to default to.

> **Claude Code does not read `AGENTS.md`.** It reads `CLAUDE.md`. A repository
> that only has `AGENTS.md` needs `--agent claude-code` as well, or Claude Code
> will never see the policy.

## The agent table

Only agents whose paths come from vendor documentation are listed. A confidently
wrong path writes a file somewhere you did not ask for, which is worse than not
supporting an agent — so anything unverified is deliberately absent.

| id | Instruction file (project) | Instruction file (global) | Skill directory |
| --- | --- | --- | --- |
| `agents` | `AGENTS.md` | — none exists — | `.agents/skills` |
| `claude-code` | `CLAUDE.md` | `~/.claude/CLAUDE.md` | `.claude/skills` |
| `codex` | `AGENTS.md` | `~/.codex/AGENTS.md` | `.agents/skills` |
| `gemini-cli` | `GEMINI.md` | `~/.gemini/GEMINI.md` | `.agents/skills` |
| `copilot` | `.github/copilot-instructions.md` | `~/.copilot/copilot-instructions.md` | `.agents/skills` |
| `cursor` | `AGENTS.md` | — UI only — | `.agents/skills` |
| `opencode` | `AGENTS.md` | `$XDG_CONFIG_HOME/opencode/AGENTS.md` | `.agents/skills` |
| `amp` | `AGENTS.md` | `$XDG_CONFIG_HOME/amp/AGENTS.md` | `.agents/skills` |
| `zed` | `AGENTS.md` | `~/.config/zed/AGENTS.md`, `%APPDATA%\Zed\AGENTS.md` on Windows | `.agents/skills` |
| `windsurf` | `AGENTS.md` | `~/.codeium/windsurf/memories/global_rules.md` | `.agents/skills` |

`.agents/skills` is not a specification — the Agent Skills spec defines only "a
folder containing a `SKILL.md`" — but it is the directory Codex, Cursor, Zed,
Amp, Copilot and OpenCode each document, and the one `npx skills` treats as
canonical.

**Rule *directories* are deliberately unsupported** (`.cursor/rules/`,
`.roo/rules/`, `.clinerules/`, `.devin/rules/`). Those agents want one file per
rule rather than a managed block in a shared file, and every one of them also
reads `AGENTS.md` — a route this tool can maintain and remove cleanly.

Caveat on Zed: `AGENTS.md` is seventh in its precedence list, so a `.rules` file
in the repository wins over it.

## The two halves, separately

Skill placement alone is better served by the ecosystem tool, which supports far
more agents than this table does:

```sh
npx skills add SurajDonthi/mdx-preview --skill mdx-docs
```

It writes no instruction file, though. That is the half this package adds — and
the half that actually changes behaviour.

## What the block looks like

```md
<!-- mdxstudio:begin -->
## Documentation is written as MDX

Project documentation is authored as `.mdx` in the MDX Studio flavour, not
plain markdown. Before creating or editing any `.mdx` file - and before
deciding whether a new document should be `.md` - read the `mdx-docs` skill
and follow it:

    ~/.claude/skills/mdx-docs/SKILL.md

It covers the pre-registered components, the brace rule that silently
deletes prose, and the house style.

Files whose audience reads them on GitHub stay plain markdown - `README.md`,
`CONTRIBUTING.md`, `CHANGELOG.md` and agent instruction files - because
GitHub renders `.mdx` as raw text with every JSX tag visible.
<!-- mdxstudio:end -->
```

Each instruction file is given the path **its own agent** reads skills from, so
a project with both `CLAUDE.md` and `AGENTS.md` gets `.claude/skills/…` in one
and `.agents/skills/…` in the other.

## Guarantees

- **Idempotent.** Running `add` twice updates the block in place; it never
  duplicates it.
- **Non-destructive.** Only the region between the sentinels is ever rewritten.
  A fresh block is appended after your existing content, which is not touched.
- **Exactly reversible.** `remove` strips the block and closes the seam, leaving
  a file that ended in a single newline byte-for-byte as it was.
- **Safe when hand-edited.** A duplicated block collapses to one. A *lone*
  sentinel has only the marker line removed — prose around it is left alone,
  because a half-deleted block is indistinguishable from something you wrote.
- **Cross-platform.** `node:path` and `node:os` throughout; no hard-coded
  separators, no `$HOME`.
- **No runtime dependencies**, so `npx` resolves and runs in one step.

## Programmatic use

```ts
import { install, uninstall, resolveAgents } from '@mdxstudio/agent-skill';

const result = install({
  scope: 'project',
  targets: resolveAgents(['claude-code', 'agents']),
  cwd: process.cwd(),
});

console.log(result.steps, result.code);
```

`upsertBlock` and `stripBlock` are exported too, if you want the managed-block
editing without the rest.

## Where the skill lives

`skills/mdx-docs/` at the root of this repository is the single source of truth.
`npm run build` and `prepack` copy it into the package as `skill/` so the
published tarball carries it; that copy is generated, never committed, so the
two cannot drift.

## License

MIT. See [LICENSE](LICENSE).
