/**
 * Copies the repository's canonical skill into the package so `npm pack` can
 * ship it.
 *
 * `skills/mdx-docs/` at the repository root is the single source of truth: it is
 * what `npx skills add <owner>/<repo> --skill mdx-docs` discovers, and what a
 * reader browsing the repository sees. Committing a second copy under the
 * package would guarantee the two drift, so the copy is generated instead - by
 * `npm run build` and again by `prepack`, which is what makes it appear in the
 * published tarball.
 *
 * No-op when the source is missing (an installed package already has its copy).
 */
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(packageRoot, '../../skills/mdx-docs');
const target = resolve(packageRoot, 'skill');

if (!existsSync(source)) {
  console.log(`[agent-skill] no canonical skill at ${source}; leaving ${target} as it is`);
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`[agent-skill] synced ${source} -> ${target}`);
