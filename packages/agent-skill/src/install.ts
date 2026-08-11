/**
 * Planning and applying an install.
 *
 * Everything is planned first and applied second, so `--dry-run` prints exactly
 * what a real run would do rather than a separate description of it.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { stripBlock, upsertBlock } from './block';
import { policyBlock } from './policy';
import { copySkill, resolveSkillSource, sameContents, SKILL_NAME } from './skill';
import { instructionPath, skillDirPath } from './targets';
import type { AgentTarget, Scope } from './targets';

export type { Scope };

export interface InstallOptions {
  scope: Scope;
  targets: AgentTarget[];
  /** Overwrite a skill directory whose contents differ. */
  force?: boolean;
  /** Plan only; touch nothing. */
  dryRun?: boolean;
  /** Home directory. Injected so tests never go near the real one. */
  home?: string;
  /** Project root for `--project`. Defaults to the working directory. */
  cwd?: string;
  /** Where to read the skill payload from. Defaults to the packaged copy. */
  skillSource?: string;
}

export type StepStatus = 'create' | 'update' | 'unchanged' | 'remove' | 'absent' | 'skip' | 'fail';

export interface Step {
  kind: 'skill' | 'instructions';
  /** Absolute path the step writes. */
  path: string;
  status: StepStatus;
  /** One line explaining the step, shown to the user. */
  detail: string;
  /** Agents this step serves - several can share one file. */
  agents: string[];
}

export interface Result {
  steps: Step[];
  /** Process exit code: 0 fine, 2 something was skipped or failed. */
  code: number;
}

/** Root every relative path in the target table hangs off. */
function scopeRoot(options: InstallOptions): string {
  return options.scope === 'global'
    ? (options.home ?? homedir())
    : resolve(options.cwd ?? process.cwd());
}

/** Always `/`-separated, so a path reads the same in a document on any platform. */
function posix(path: string): string {
  return path.split('\\').join('/');
}

/**
 * How a path is written inside an instruction file: `~/...` for a global
 * install, relative to the project root for a project one.
 *
 * Both sides are normalised before comparing. `os.homedir()` and `path.join()`
 * do not have to agree about separators - `USERPROFILE` may hold forward
 * slashes on Windows while `join` emits backslashes - and Windows paths differ
 * in case without differing in meaning. Getting this wrong is not cosmetic: the
 * block would carry a machine-specific absolute path into a file people commit.
 */
function referencePath(fullPath: string, root: string, scope: Scope): string {
  const full = posix(fullPath);
  const base = posix(root).replace(/\/+$/, '');
  const comparable = process.platform === 'win32' ? full.toLowerCase() : full;
  const comparableBase = process.platform === 'win32' ? base.toLowerCase() : base;

  if (comparable !== comparableBase && !comparable.startsWith(`${comparableBase}/`)) {
    return full;
  }

  const rest = full.slice(base.length).replace(/^\//, '');
  return scope === 'global' ? `~/${rest}` : rest;
}

interface Slot {
  path: string;
  /** Agents served by this path, in table order. */
  targets: AgentTarget[];
}

/** Labels for the report. */
function labels(slot: Slot): string[] {
  return slot.targets.map((target) => target.label);
}

/**
 * Collapses the target table into the distinct files and directories to touch.
 *
 * Two agents that read the same `AGENTS.md`, or share `.agents/skills/`, must
 * produce one step, not two - otherwise the second overwrites the first and the
 * output lies about what happened.
 */
function collect(
  targets: AgentTarget[],
  pick: (target: AgentTarget) => string | null
): Slot[] {
  const slots = new Map<string, Slot>();

  for (const target of targets) {
    const full = pick(target);
    if (!full) continue;
    const slot = slots.get(full) ?? { path: full, targets: [] };
    if (!slot.targets.includes(target)) slot.targets.push(target);
    slots.set(full, slot);
  }

  return [...slots.values()];
}

function skillSlots(targets: AgentTarget[], scope: Scope, root: string): Slot[] {
  return collect(targets, (target) => skillDirPath(target, scope, root));
}

function instructionSlots(targets: AgentTarget[], scope: Scope, root: string): Slot[] {
  return collect(targets, (target) => instructionPath(target, scope, root));
}

/** Writes a file, creating its directory, and reports a clear error if it cannot. */
function writeFile(path: string, contents: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents, 'utf8');
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`cannot write ${path}: ${reason}`);
  }
}

/** Installs the skill and the policy block for every selected target. */
export function install(options: InstallOptions): Result {
  const root = scopeRoot(options);
  const source = options.skillSource ?? resolveSkillSource();
  const steps: Step[] = [];

  // The skill goes down first: the policy block quotes where it landed, and a
  // block pointing at a path that does not exist is worse than no block.
  // Keyed by agent id, because an agent's instruction file must point at that
  // agent's own skill directory - Claude Code reads `.claude/skills`, everyone
  // else reads `.agents/skills`, and telling one to look in the other's is a
  // path it will never load.
  const skillPathByAgent = new Map<string, string>();

  for (const slot of skillSlots(options.targets, options.scope, root)) {
    const target = join(slot.path, SKILL_NAME);
    for (const agent of slot.targets) {
      skillPathByAgent.set(agent.id, join(target, 'SKILL.md'));
    }

    if (sameContents(source, target)) {
      steps.push({
        kind: 'skill',
        path: target,
        status: 'unchanged',
        detail: 'already up to date',
        agents: labels(slot),
      });
      continue;
    }

    const present = existsSync(target);
    if (present && !options.force) {
      steps.push({
        kind: 'skill',
        path: target,
        status: 'skip',
        detail: 'a different copy is already there - re-run with --force to replace it',
        agents: labels(slot),
      });
      continue;
    }

    if (options.dryRun) {
      steps.push({
        kind: 'skill',
        path: target,
        status: present ? 'update' : 'create',
        detail: present ? 'would be replaced' : 'would be written',
        agents: labels(slot),
      });
      continue;
    }

    try {
      mkdirSync(dirname(target), { recursive: true });
      copySkill(source, target);
      steps.push({
        kind: 'skill',
        path: target,
        status: present ? 'update' : 'create',
        detail: present ? 'replaced' : 'written',
        agents: labels(slot),
      });
    } catch (cause) {
      steps.push({
        kind: 'skill',
        path: target,
        status: 'fail',
        detail: cause instanceof Error ? cause.message : String(cause),
        agents: labels(slot),
      });
    }
  }

  for (const slot of instructionSlots(options.targets, options.scope, root)) {
    // Agents sharing one instruction file share the skill copy named in it.
    // They agree in practice: everything that shares `AGENTS.md` also shares
    // `.agents/skills`.
    const skillPath = slot.targets
      .map((agent) => skillPathByAgent.get(agent.id))
      .find((path): path is string => Boolean(path));
    const body = policyBlock(
      skillPath ? referencePath(skillPath, root, options.scope) : `${SKILL_NAME}/SKILL.md`
    );

    const fileExisted = existsSync(slot.path);
    const existing = fileExisted ? readFileSync(slot.path, 'utf8') : '';
    const edit = upsertBlock(existing, body);

    const repaired = edit.repairedPartialMarkers ? ' (repaired stray markers)' : '';
    if (edit.action === 'unchanged') {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'unchanged',
        detail: 'block already current',
        agents: labels(slot),
      });
      continue;
    }

    const verb =
      edit.action === 'updated'
        ? 'block updated in place'
        : fileExisted
          ? 'block appended, the rest left untouched'
          : 'file created with the block';

    if (options.dryRun) {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: edit.action === 'created' ? 'create' : 'update',
        detail: `would be ${verb}${repaired}`,
        agents: labels(slot),
      });
      continue;
    }

    try {
      writeFile(slot.path, edit.text);
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: edit.action === 'created' ? 'create' : 'update',
        detail: `${verb}${repaired}`,
        agents: labels(slot),
      });
    } catch (cause) {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'fail',
        detail: cause instanceof Error ? cause.message : String(cause),
        agents: labels(slot),
      });
    }
  }

  return { steps, code: exitCode(steps) };
}

/** Removes the skill directory and the policy block for every selected target. */
export function uninstall(options: InstallOptions): Result {
  const root = scopeRoot(options);
  const steps: Step[] = [];

  for (const slot of skillSlots(options.targets, options.scope, root)) {
    const target = join(slot.path, SKILL_NAME);

    if (!existsSync(target)) {
      steps.push({
        kind: 'skill',
        path: target,
        status: 'absent',
        detail: 'nothing there',
        agents: labels(slot),
      });
      continue;
    }

    if (options.dryRun) {
      steps.push({
        kind: 'skill',
        path: target,
        status: 'remove',
        detail: 'would be deleted',
        agents: labels(slot),
      });
      continue;
    }

    try {
      rmSync(target, { recursive: true, force: true });
      steps.push({
        kind: 'skill',
        path: target,
        status: 'remove',
        detail: 'deleted',
        agents: labels(slot),
      });
    } catch (cause) {
      steps.push({
        kind: 'skill',
        path: target,
        status: 'fail',
        detail: cause instanceof Error ? cause.message : String(cause),
        agents: labels(slot),
      });
    }
  }

  for (const slot of instructionSlots(options.targets, options.scope, root)) {
    if (!existsSync(slot.path)) {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'absent',
        detail: 'no such file',
        agents: labels(slot),
      });
      continue;
    }

    const edit = stripBlock(readFileSync(slot.path, 'utf8'));
    if (edit.action === 'absent' && !edit.repairedPartialMarkers) {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'absent',
        detail: 'no managed block in it',
        agents: labels(slot),
      });
      continue;
    }

    if (options.dryRun) {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'remove',
        detail: 'block would be stripped, the rest left untouched',
        agents: labels(slot),
      });
      continue;
    }

    try {
      writeFile(slot.path, edit.text);
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'remove',
        detail: 'block stripped, the rest left untouched',
        agents: labels(slot),
      });
    } catch (cause) {
      steps.push({
        kind: 'instructions',
        path: slot.path,
        status: 'fail',
        detail: cause instanceof Error ? cause.message : String(cause),
        agents: labels(slot),
      });
    }
  }

  return { steps, code: exitCode(steps) };
}

function exitCode(steps: Step[]): number {
  return steps.some((step) => step.status === 'fail' || step.status === 'skip') ? 2 : 0;
}
