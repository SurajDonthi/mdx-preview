import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { install, uninstall } from '../src/install';
import { listFiles, resolveSkillSource, SKILL_NAME } from '../src/skill';
import { resolveAgents } from '../src/targets';

/**
 * These drive the real installer against a throwaway directory tree. Nothing
 * here reads `os.homedir()` - `home` and `cwd` are injected - so a test can
 * never reach the machine's actual agent configuration.
 */

const SKILL_SOURCE = resolveSkillSource();
const CLAUDE = resolveAgents(['claude-code']);

let home: string;
let project: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'mdxstudio-home-'));
  project = mkdtempSync(join(tmpdir(), 'mdxstudio-proj-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
});

function globalOptions(extra: Record<string, unknown> = {}) {
  return { scope: 'global' as const, targets: CLAUDE, home, skillSource: SKILL_SOURCE, ...extra };
}

const claudeMd = () => join(home, '.claude', 'CLAUDE.md');
const skillDir = () => join(home, '.claude', 'skills', SKILL_NAME);

describe('install, globally', () => {
  it('lands every skill file and creates the instruction file', () => {
    const result = install(globalOptions());

    expect(result.code).toBe(0);
    expect(listFiles(skillDir())).toEqual([
      'SKILL.md',
      'references/components.md',
      'references/extending.md',
      'references/flowgraph.md',
      'references/mermaid.md',
    ]);

    const contents = readFileSync(claudeMd(), 'utf8');
    expect(contents).toContain('<!-- mdxstudio:begin -->');
    expect(contents).toContain('<!-- mdxstudio:end -->');
    expect(contents).toContain('.mdx');
  });

  it('points the block at a home-relative path, never a machine-specific one', () => {
    install(globalOptions());

    const contents = readFileSync(claudeMd(), 'utf8');
    expect(contents).toContain(`~/.claude/skills/${SKILL_NAME}/SKILL.md`);
    expect(contents).not.toContain(home);
  });

  it('appends to an instruction file that already has rules, keeping them', () => {
    const existing = '# My rules\n\nAlways answer concisely.\n';
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(claudeMd(), existing, 'utf8');

    install(globalOptions());

    const contents = readFileSync(claudeMd(), 'utf8');
    expect(contents.startsWith(existing)).toBe(true);
  });

  it('is a no-op the second time', () => {
    install(globalOptions());
    const afterFirst = readFileSync(claudeMd(), 'utf8');

    const second = install(globalOptions());

    expect(second.code).toBe(0);
    expect(second.steps.every((step) => step.status === 'unchanged')).toBe(true);
    expect(readFileSync(claudeMd(), 'utf8')).toBe(afterFirst);
  });
});

describe('uninstall', () => {
  it('restores the instruction file byte-for-byte and deletes the skill', () => {
    const existing = '# My rules\n\nAlways answer concisely.\n';
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(claudeMd(), existing, 'utf8');

    install(globalOptions());
    const result = uninstall(globalOptions());

    expect(result.code).toBe(0);
    expect(readFileSync(claudeMd(), 'utf8')).toBe(existing);
    expect(existsSync(skillDir())).toBe(false);
  });

  it('reports absent rather than failing when there is nothing installed', () => {
    const result = uninstall(globalOptions());

    expect(result.code).toBe(0);
    expect(result.steps.every((step) => step.status === 'absent')).toBe(true);
  });
});

describe('--force', () => {
  it('refuses to overwrite a different copy and exits 2', () => {
    install(globalOptions());
    writeFileSync(join(skillDir(), 'SKILL.md'), 'locally edited', 'utf8');

    const result = install(globalOptions());

    expect(result.code).toBe(2);
    expect(result.steps.find((step) => step.kind === 'skill')?.status).toBe('skip');
    expect(readFileSync(join(skillDir(), 'SKILL.md'), 'utf8')).toBe('locally edited');
  });

  it('replaces it when forced', () => {
    install(globalOptions());
    writeFileSync(join(skillDir(), 'SKILL.md'), 'locally edited', 'utf8');

    const result = install(globalOptions({ force: true }));

    expect(result.code).toBe(0);
    expect(readFileSync(join(skillDir(), 'SKILL.md'), 'utf8')).toContain('name: mdx-docs');
  });

  it('drops a file the skill no longer ships', () => {
    install(globalOptions());
    writeFileSync(join(skillDir(), 'stale.md'), 'left over from an old version', 'utf8');

    install(globalOptions({ force: true }));

    expect(existsSync(join(skillDir(), 'stale.md'))).toBe(false);
  });
});

describe('--dry-run', () => {
  it('writes nothing at all', () => {
    const result = install(globalOptions({ dryRun: true }));

    expect(result.code).toBe(0);
    expect(result.steps.map((step) => step.status)).toEqual(['create', 'create']);
    expect(existsSync(skillDir())).toBe(false);
    expect(existsSync(claudeMd())).toBe(false);
  });

  it('does not undo an existing install', () => {
    install(globalOptions());
    const before = readFileSync(claudeMd(), 'utf8');

    uninstall(globalOptions({ dryRun: true }));

    expect(readFileSync(claudeMd(), 'utf8')).toBe(before);
    expect(existsSync(skillDir())).toBe(true);
  });
});

describe('several agents in one project', () => {
  const both = resolveAgents(['claude-code', 'copilot']);

  it('gives each instruction file the skill directory its own agent reads', () => {
    install({ scope: 'project', targets: both, cwd: project, skillSource: SKILL_SOURCE });

    const claude = readFileSync(join(project, 'CLAUDE.md'), 'utf8');
    const copilot = readFileSync(
      join(project, '.github', 'copilot-instructions.md'),
      'utf8'
    );

    expect(claude).toContain(`.claude/skills/${SKILL_NAME}/SKILL.md`);
    expect(copilot).toContain(`.agents/skills/${SKILL_NAME}/SKILL.md`);
  });

  it('writes one step per distinct path, not one per agent', () => {
    // `agents` and `codex` both mean AGENTS.md and .agents/skills.
    const shared = resolveAgents(['agents', 'codex']);

    const result = install({
      scope: 'project',
      targets: shared,
      cwd: project,
      skillSource: SKILL_SOURCE,
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[1].agents).toEqual(['AGENTS.md', 'OpenAI Codex CLI']);
  });
});

describe('when a path cannot be written', () => {
  it('reports the failure and exits 2 instead of throwing', () => {
    // A file where the skills directory needs to be makes mkdir fail.
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(join(home, '.claude', 'skills'), 'not a directory', 'utf8');

    const result = install(globalOptions());

    expect(result.code).toBe(2);
    const failed = result.steps.find((step) => step.status === 'fail');
    expect(failed?.kind).toBe('skill');
    expect(failed?.detail).toBeTruthy();
  });
});
