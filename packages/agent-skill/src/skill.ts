/**
 * Locating and copying the skill payload.
 *
 * The canonical skill lives at `skills/mdx-docs/` in the repository, which is
 * what `npx skills` discovers. `npm run build` and `prepack` copy it to
 * `<package>/skill/` so the published tarball carries it. Both layouts are
 * looked for, so the CLI works from an installed package and from a checkout.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory name the skill is installed under, and its frontmatter `name`. */
export const SKILL_NAME = 'mdx-docs';

/** Where this module is on disk. */
function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/**
 * The directory holding `SKILL.md`.
 *
 * @throws when neither layout is present, which means a broken install rather
 * than anything the caller can recover from.
 */
export function resolveSkillSource(from: string = moduleDir()): string {
  const candidates = [
    // Published tarball: dist/cli.js -> ../skill
    resolve(from, '../skill'),
    // Repository checkout: packages/agent-skill/src -> ../../../skills/mdx-docs
    resolve(from, `../../../skills/${SKILL_NAME}`),
    resolve(from, `../../skills/${SKILL_NAME}`),
  ];

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'SKILL.md'))) return candidate;
  }

  throw new Error(
    `Could not find the ${SKILL_NAME} skill payload. Looked in:\n` +
      candidates.map((candidate) => `  ${candidate}`).join('\n')
  );
}

/** Every file under `root`, as paths relative to it, sorted. */
export function listFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) found.push(relative(root, full).split(sep).join('/'));
    }
  };

  walk(root);
  return found.sort();
}

/** True when `target` already holds byte-identical copies of every source file. */
export function sameContents(source: string, target: string): boolean {
  if (!existsSync(target) || !statSync(target).isDirectory()) return false;

  const sourceFiles = listFiles(source);
  if (JSON.stringify(sourceFiles) !== JSON.stringify(listFiles(target))) return false;

  return sourceFiles.every((file) =>
    readFileSync(join(source, ...file.split('/'))).equals(
      readFileSync(join(target, ...file.split('/')))
    )
  );
}

/**
 * Copies the skill payload to `target`, replacing whatever is there.
 *
 * The target is removed first so a file dropped from a newer version of the
 * skill does not survive the upgrade.
 */
export function copySkill(source: string, target: string): void {
  rmSync(target, { recursive: true, force: true });
  cpSync(source, target, { recursive: true });
}
