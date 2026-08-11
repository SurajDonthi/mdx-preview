import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => path.resolve(root, `packages/${name}/src/index.ts`);

/**
 * Workspace packages are TypeScript source, not built artifacts. Resolving them
 * explicitly - the same way `apps/studio/vite.config.ts` does - keeps Vitest
 * compiling the sources under test instead of treating them as prebuilt deps.
 */
const alias = {
  '@mdxstudio/core': pkg('core'),
  '@mdxstudio/react': pkg('react'),
  '@mdxstudio/mermaid': pkg('mermaid'),
  '@mdxstudio/charts': pkg('charts'),
  '@mdxstudio/flow': pkg('flow'),
  '@mdxstudio/tasks': pkg('tasks'),
  '@mdxstudio/pdf': pkg('pdf'),
};

export default defineConfig({
  resolve: {
    alias,
    // One React instance across every workspace package, as in the app build.
    dedupe: ['react', 'react-dom'],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'core',
          root: path.resolve(root, 'packages/core'),
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'react',
          root: path.resolve(root, 'packages/react'),
          // The renderer mounts real React trees, including the error boundary,
          // which only runs client-side.
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'tasks',
          root: path.resolve(root, 'packages/tasks'),
          // The parser is environment-free, but the board is mounted for real
          // in the same project, and a component test needs a DOM.
          environment: 'jsdom',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'sandbox',
          root: path.resolve(root, 'packages/sandbox'),
          // The protocol itself is environment-free; the bridge tests drive the
          // real host and guest code against fake windows, so they need a DOM.
          environment: 'jsdom',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        },
      },
      {
        extends: true,
        test: {
          name: 'agent-skill',
          root: path.resolve(root, 'packages/agent-skill'),
          // A CLI: it edits files on disk and never touches a DOM.
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'cli',
          root: path.resolve(root, 'packages/cli'),
          // Walks folders, watches files and serves them; no DOM involved.
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'vscode',
          root: path.resolve(root, 'apps/vscode'),
          // The extension half runs in Node; the webview half is tested through
          // its own modules rather than by mounting a real webview.
          environment: 'node',
          include: ['tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'studio',
          root: path.resolve(root, 'apps/studio'),
          // storage.ts talks to localStorage, and the editor is mounted for real.
          environment: 'jsdom',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        },
      },
    ],
  },
});
