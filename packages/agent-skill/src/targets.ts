/**
 * Which file each agent reads its standing instructions from, and where it
 * loads skills from.
 *
 * This is **data on purpose**. Supporting a new agent is one row; nothing in
 * `install.ts` branches on an agent's identity.
 *
 * A row is only here when both of its paths come from the vendor's own
 * documentation. A confidently wrong path writes a file somewhere the user did
 * not ask for, which is worse than not supporting an agent - so agents whose
 * conventions could not be verified are deliberately absent, and `npx skills`
 * is pointed at instead for skill placement.
 *
 * Two shapes are deliberately unsupported:
 *
 * - **Rule *directories*** (`.cursor/rules/`, `.roo/rules/`, `.clinerules/`,
 *   `.devin/rules/`). Those agents want one file per rule, not a managed block
 *   inside a shared file, and every one of them also reads `AGENTS.md` - which
 *   is a route this tool can maintain and remove cleanly.
 * - **A user-level `AGENTS.md`.** The specification defines none; every global
 *   path below is a per-vendor invention, so each is listed under its own agent
 *   rather than pretended to be shared.
 */
import { join } from 'node:path';

export interface AgentTarget {
  /** What `--agent` takes. */
  id: string;
  /** Human name, used in output. */
  label: string;
  /** Instruction file relative to the project root, or `null` if it has none. */
  projectInstructionFile: string | null;
  /**
   * Instruction file relative to the home directory, or `null` when the agent
   * documents no user-level file. May begin with `$XDG_CONFIG_HOME/`.
   */
  globalInstructionFile: string | null;
  /** Replaces {@link globalInstructionFile} on Windows. May begin with `$APPDATA/`. */
  globalInstructionFileWin32?: string;
  /** Skill directory relative to the project root, or `null`. */
  projectSkillDir: string | null;
  /** Skill directory relative to the home directory, or `null`. */
  globalSkillDir: string | null;
  /** One line for `list`. */
  note: string;
}

/**
 * The cross-agent skill directory.
 *
 * Not a specification - the Agent Skills spec defines only "a folder containing
 * a SKILL.md" - but a convention independently documented by Codex, Cursor,
 * Zed, Amp, Copilot and OpenCode, and the directory `npx skills` treats as
 * canonical.
 */
const UNIVERSAL_SKILLS = '.agents/skills';

export const AGENT_TARGETS: AgentTarget[] = [
  {
    id: 'agents',
    label: 'AGENTS.md',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: null,
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'the cross-agent standard, stewarded by the Agentic AI Foundation; no user-level file exists',
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    projectInstructionFile: 'CLAUDE.md',
    globalInstructionFile: '.claude/CLAUDE.md',
    projectSkillDir: '.claude/skills',
    globalSkillDir: '.claude/skills',
    note: 'reads CLAUDE.md and NOT AGENTS.md; has a native skill loader',
  },
  {
    id: 'codex',
    label: 'OpenAI Codex CLI',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: '.codex/AGENTS.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'AGENTS.md is its native format; skills load from .agents/skills',
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    projectInstructionFile: 'GEMINI.md',
    globalInstructionFile: '.gemini/GEMINI.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'GEMINI.md by default; AGENTS.md only if context.fileName says so',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    projectInstructionFile: '.github/copilot-instructions.md',
    globalInstructionFile: '.copilot/copilot-instructions.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'also reads AGENTS.md, so the `agents` row covers it in a project',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: null,
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'reads AGENTS.md natively; its user rules live in the UI, not on disk',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: '$XDG_CONFIG_HOME/opencode/AGENTS.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'AGENTS.md natively, walking up from the working directory',
  },
  {
    id: 'amp',
    label: 'Amp',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: '$XDG_CONFIG_HOME/amp/AGENTS.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'AGENTS.md natively, from the working directory up to the home directory',
  },
  {
    id: 'zed',
    label: 'Zed',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: '.config/zed/AGENTS.md',
    globalInstructionFileWin32: '$APPDATA/Zed/AGENTS.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'AGENTS.md is 7th in its precedence list - a .rules file in the repo wins',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    projectInstructionFile: 'AGENTS.md',
    globalInstructionFile: '.codeium/windsurf/memories/global_rules.md',
    projectSkillDir: UNIVERSAL_SKILLS,
    globalSkillDir: UNIVERSAL_SKILLS,
    note: 'reads AGENTS.md from any workspace directory; rule directories are being renamed upstream',
  },
];

/**
 * What a project install targets when `--agent` is not given and nothing else
 * is detected.
 *
 * `AGENTS.md` alone. Writing ten instruction files because somebody typed one
 * command is rude, and `AGENTS.md` is the one file the largest number of agents
 * read. Detection widens this automatically when other files already exist.
 *
 * There is no global equivalent: the specification defines no user-level
 * `AGENTS.md`, so a global install with nothing detected asks for `--agent`
 * rather than inventing a path.
 */
export const DEFAULT_AGENT_IDS = ['agents'];

export class UnknownAgentError extends Error {}

/** Expands the `$VAR/` prefixes the table is allowed to use. */
function expandGlobal(template: string, home: string): string {
  if (template.startsWith('$XDG_CONFIG_HOME/')) {
    const base = process.env.XDG_CONFIG_HOME || join(home, '.config');
    return join(base, ...template.slice('$XDG_CONFIG_HOME/'.length).split('/'));
  }
  if (template.startsWith('$APPDATA/')) {
    const base = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    return join(base, ...template.slice('$APPDATA/'.length).split('/'));
  }
  return join(home, ...template.split('/'));
}

export type Scope = 'global' | 'project';

/** Absolute path of an agent's instruction file, or `null` when it has none. */
export function instructionPath(target: AgentTarget, scope: Scope, root: string): string | null {
  if (scope === 'project') {
    return target.projectInstructionFile
      ? join(root, ...target.projectInstructionFile.split('/'))
      : null;
  }
  const template =
    (process.platform === 'win32' ? target.globalInstructionFileWin32 : undefined) ??
    target.globalInstructionFile;
  return template ? expandGlobal(template, root) : null;
}

/** Absolute path of an agent's skill directory, or `null` when it has none. */
export function skillDirPath(target: AgentTarget, scope: Scope, root: string): string | null {
  const relativePath = scope === 'project' ? target.projectSkillDir : target.globalSkillDir;
  return relativePath ? join(root, ...relativePath.split('/')) : null;
}

/** Looks up agents by id, failing loudly on a typo rather than silently. */
export function resolveAgents(ids: string[]): AgentTarget[] {
  const resolved: AgentTarget[] = [];

  for (const id of ids) {
    const target = AGENT_TARGETS.find((candidate) => candidate.id === id);
    if (!target) {
      throw new UnknownAgentError(
        `unknown agent "${id}". Known: ${AGENT_TARGETS.map((c) => c.id).join(', ')}.\n` +
          'Run `mdxstudio-skill list` for the paths each one uses.'
      );
    }
    if (!resolved.includes(target)) resolved.push(target);
  }

  return resolved;
}

/**
 * Agents whose instruction file is already present.
 *
 * A repository holding both `CLAUDE.md` and `AGENTS.md` wants both updated; a
 * repository holding neither wants the standard one. Detection is what makes
 * the no-flag case do the obvious thing.
 */
export function detectAgents(
  scope: Scope,
  root: string,
  exists: (path: string) => boolean
): AgentTarget[] {
  return AGENT_TARGETS.filter((target) => {
    const path = instructionPath(target, scope, root);
    return path !== null && exists(path);
  });
}
