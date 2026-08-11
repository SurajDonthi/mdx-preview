#!/usr/bin/env node
/**
 * `mdxstudio-skill` - installs the `mdx-docs` skill and the standing
 * documentation policy into a coding agent's instruction file.
 *
 * Argument parsing is done by hand: this package has no runtime dependencies so
 * that `npx @mdxstudio/agent-skill add` resolves and runs in one step.
 */
import { install, uninstall } from './install';
import type { Result, Scope, Step } from './install';
import { resolveSkillSource, SKILL_NAME } from './skill';
import {
  AGENT_TARGETS,
  DEFAULT_AGENT_IDS,
  detectAgents,
  instructionPath,
  resolveAgents,
  skillDirPath,
  UnknownAgentError,
} from './targets';
import type { AgentTarget } from './targets';

const HELP = `mdxstudio-skill - install the ${SKILL_NAME} skill for any coding agent

Usage
  npx @mdxstudio/agent-skill add [options]
  npx @mdxstudio/agent-skill remove [options]
  npx @mdxstudio/agent-skill list

Commands
  add        Place the skill and insert the documentation policy block
  remove     Delete the skill and strip the policy block
  list       Show every known agent and the paths it would be given

Options
  --project            Operate on this repository (./AGENTS.md, ./.agents/skills)
  --global             Operate on the home directory (the default)
  --agent <ids>        Comma-separated agent ids; repeatable
  --all                Every known agent
  --force              Replace a skill directory whose contents differ
  --dry-run            Print what would change; touch nothing
  -h, --help           This text
  -v, --version        Package version

Which agents are chosen
  With --agent, exactly those. With --all, every known agent. Otherwise the
  instruction files already present are detected and used.

  If nothing is detected:
    --project  falls back to ${DEFAULT_AGENT_IDS.join(', ')} (AGENTS.md, the cross-agent standard)
    --global   FAILS and asks you to name an agent

  That asymmetry is deliberate, and it is the thing most people get wrong:
  the AGENTS.md standard defines a repository file only. There is no
  user-level AGENTS.md, so a global install has nothing safe to default to.
  Note also that Claude Code does not read AGENTS.md at all - it reads
  CLAUDE.md - so a project that only has AGENTS.md needs --agent claude-code
  as well.

Exit codes
  0  everything applied, or there was nothing to do
  1  bad arguments, or no agent could be chosen
  2  something was skipped or failed - the output says which

Notes
  The skill itself can also be installed with the ecosystem tool:
    npx skills add SurajDonthi/mdx-preview --skill ${SKILL_NAME}
  That covers far more agents, but writes no instruction file. This command is
  the half that does - the policy block is what changes an agent's behaviour.
`;

interface Args {
  command: 'add' | 'remove' | 'list' | 'help' | 'version';
  scope: Scope;
  agents: string[];
  all: boolean;
  force: boolean;
  dryRun: boolean;
}

class UsageError extends Error {}

function parse(argv: string[]): Args {
  const args: Args = {
    command: 'help',
    scope: 'global',
    agents: [],
    all: false,
    force: false,
    dryRun: false,
  };

  let sawCommand = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    switch (argument) {
      case 'add':
      case 'install':
        args.command = 'add';
        sawCommand = true;
        break;
      case 'remove':
      case 'uninstall':
        args.command = 'remove';
        sawCommand = true;
        break;
      case 'list':
        args.command = 'list';
        sawCommand = true;
        break;
      case '--project':
      case '-p':
        args.scope = 'project';
        break;
      case '--global':
      case '-g':
        args.scope = 'global';
        break;
      case '--all':
        args.all = true;
        break;
      case '--force':
      case '-f':
        args.force = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        args.command = 'help';
        return args;
      case '--version':
      case '-v':
        args.command = 'version';
        return args;
      case '--agent':
      case '-a': {
        const value = argv[index + 1];
        if (!value || value.startsWith('-')) {
          throw new UsageError('--agent needs a value, e.g. --agent claude-code,codex');
        }
        args.agents.push(...value.split(',').map((part) => part.trim()).filter(Boolean));
        index += 1;
        break;
      }
      default:
        if (argument.startsWith('--agent=')) {
          args.agents.push(
            ...argument.slice('--agent='.length).split(',').map((part) => part.trim()).filter(Boolean)
          );
          break;
        }
        throw new UsageError(`unrecognised argument: ${argument}`);
    }
  }

  if (!sawCommand && args.command !== 'version') args.command = 'help';
  return args;
}

const SYMBOL: Record<Step['status'], string> = {
  create: '+',
  update: '~',
  unchanged: '=',
  remove: '-',
  absent: '.',
  skip: '!',
  fail: 'x',
};

function report(result: Result, dryRun: boolean): void {
  if (result.steps.length === 0) {
    console.log('Nothing to do - no agent selected has a path to write.');
    return;
  }

  const width = Math.max(...result.steps.map((step) => step.path.length));

  for (const step of result.steps) {
    const agents = step.agents.join(', ');
    console.log(
      `  ${SYMBOL[step.status]} ${step.path.padEnd(width)}  ${step.detail}  [${agents}]`
    );
  }

  const failed = result.steps.filter((step) => step.status === 'fail');
  const skipped = result.steps.filter((step) => step.status === 'skip');

  console.log('');
  if (dryRun) console.log('Dry run - nothing was written.');
  if (skipped.length > 0) {
    console.log(`${skipped.length} skipped. Re-run with --force to replace them.`);
  }
  for (const step of failed) console.error(`Failed: ${step.path} - ${step.detail}`);
}

function listAgents(home: string): void {
  console.log('Known agents. Pass one or more to --agent.\n');

  for (const target of AGENT_TARGETS) {
    const global = instructionPath(target, 'global', home);
    console.log(`  ${target.id}  (${target.label})`);
    console.log(`      ${target.note}`);
    console.log(`      project instructions: ${target.projectInstructionFile ?? 'none'}`);
    console.log(`      global  instructions: ${global ? tilde(global, home) : 'none documented'}`);
    console.log(`      project skill:        ${target.projectSkillDir ?? 'none'}/${SKILL_NAME}`);
    console.log(
      `      global  skill:        ${
        skillDirPath(target, 'global', home)
          ? `${tilde(skillDirPath(target, 'global', home) as string, home)}/${SKILL_NAME}`
          : 'none'
      }`
    );
    console.log('');
  }

  console.log('Without --agent, the instruction files already present are detected.');
  console.log(
    `If none are found: --project falls back to ${DEFAULT_AGENT_IDS.join(', ')}; --global fails and asks.`
  );
}

/** `~/a/b` when the path is under home. Display only. */
function tilde(fullPath: string, home: string): string {
  const normalised = fullPath.split('\\').join('/');
  const base = home.split('\\').join('/');
  return normalised.startsWith(base) ? `~${normalised.slice(base.length)}` : normalised;
}

async function version(): Promise<string> {
  const { readFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [resolve(here, '../package.json'), resolve(here, 'package.json')]) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')).version as string;
    } catch {
      // try the next layout
    }
  }
  return 'unknown';
}

async function main(argv: string[]): Promise<number> {
  let args: Args;
  try {
    args = parse(argv);
  } catch (cause) {
    console.error(cause instanceof UsageError ? cause.message : String(cause));
    console.error('\nRun with --help for usage.');
    return 1;
  }

  if (args.command === 'help') {
    console.log(HELP);
    return 0;
  }
  if (args.command === 'version') {
    console.log(await version());
    return 0;
  }
  const { existsSync } = await import('node:fs');
  const { homedir } = await import('node:os');

  if (args.command === 'list') {
    listAgents(homedir());
    return 0;
  }

  const root = args.scope === 'global' ? homedir() : process.cwd();

  let targets: AgentTarget[];
  try {
    targets = args.all ? AGENT_TARGETS : resolveAgents(args.agents);
  } catch (cause) {
    console.error(cause instanceof UnknownAgentError ? cause.message : String(cause));
    return 1;
  }

  if (targets.length === 0) {
    const detected = detectAgents(args.scope, root, existsSync);
    if (detected.length > 0) {
      targets = detected;
      console.log(
        `Detected ${detected.map((target) => target.id).join(', ')} from the instruction files already present.\n`
      );
    } else if (args.scope === 'project') {
      targets = resolveAgents(DEFAULT_AGENT_IDS);
    } else {
      // There is no user-level AGENTS.md in the specification, so there is
      // nothing safe to fall back to. Asking beats inventing a path.
      console.error(
        'No agent instruction file was found in your home directory, and the\n' +
          'AGENTS.md standard defines no user-level file, so there is no safe default.\n\n' +
          'Name the agent explicitly, for example:\n' +
          `  npx @mdxstudio/agent-skill add --agent claude-code\n\n` +
          `Agents with a documented user-level file: ${AGENT_TARGETS.filter(
            (target) => target.globalInstructionFile
          )
            .map((target) => target.id)
            .join(', ')}.\n` +
          'Run `list` for the exact paths, or use --project to install into this repository.'
      );
      return 1;
    }
  }

  let skillSource: string;
  try {
    skillSource = resolveSkillSource();
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    return 2;
  }

  const names = targets.map((target) => target.id).join(', ');
  const where = args.scope === 'global' ? 'the home directory' : 'this repository';
  console.log(
    `${args.command === 'add' ? 'Installing' : 'Removing'} ${SKILL_NAME} for ${names} in ${where}.\n`
  );

  const options = {
    scope: args.scope,
    targets,
    force: args.force,
    dryRun: args.dryRun,
    skillSource,
  };

  const result = args.command === 'add' ? install(options) : uninstall(options);
  report(result, args.dryRun);
  return result.code;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 2;
  }
);
