/**
 * Programmatic access to what the `mdxstudio-skill` CLI does.
 *
 * Exported so a project can wire the install into its own setup script, and so
 * the tests can drive a real install against a temporary home directory without
 * spawning a process.
 */
export { BEGIN_MARKER, END_MARKER, hasBlock, stripBlock, upsertBlock } from './block';
export type { BlockAction, BlockEdit } from './block';

export { install, uninstall } from './install';
export type { InstallOptions, Result, Step, StepStatus } from './install';

export { policyBlock } from './policy';

export { copySkill, listFiles, resolveSkillSource, sameContents, SKILL_NAME } from './skill';

export {
  AGENT_TARGETS,
  DEFAULT_AGENT_IDS,
  detectAgents,
  instructionPath,
  resolveAgents,
  skillDirPath,
  UnknownAgentError,
} from './targets';
export type { AgentTarget, Scope } from './targets';
