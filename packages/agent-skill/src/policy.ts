/**
 * The text inserted into an agent's instruction file.
 *
 * This is the half that actually changes behaviour. A skill is reference
 * material an agent loads when it decides it is relevant; "documentation is
 * written as `.mdx`, not `.md`" is standing policy that only applies if it is
 * in the file the agent always reads.
 *
 * Deliberately short. It is a trigger, not a manual - everything else lives in
 * the skill, and a long block in an instruction file competes with the rules
 * the user wrote themselves.
 */

/**
 * @param skillPath where `SKILL.md` was installed, written the way a human
 * would type it (`~/.claude/skills/mdx-docs/SKILL.md`). Agents without a skill
 * loader still find it, because the path is right there.
 */
export function policyBlock(skillPath: string): string {
  return [
    '## Documentation is written as MDX',
    '',
    'Project documentation is authored as `.mdx` in the MDX Studio flavour, not',
    'plain markdown. Before creating or editing any `.mdx` file - and before',
    'deciding whether a new document should be `.md` - read the `mdx-docs` skill',
    'and follow it:',
    '',
    `    ${skillPath}`,
    '',
    'It covers the pre-registered components, the brace rule that silently',
    'deletes prose, and the house style.',
    '',
    'Files whose audience reads them on GitHub stay plain markdown - `README.md`,',
    '`CONTRIBUTING.md`, `CHANGELOG.md` and agent instruction files - because',
    'GitHub renders `.mdx` as raw text with every JSX tag visible.',
  ].join('\n');
}
