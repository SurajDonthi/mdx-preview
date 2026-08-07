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
  '@mdxkit/core': pkg('core'),
  '@mdxkit/react': pkg('react'),
  '@mdxkit/mermaid': pkg('mermaid'),
  '@mdxkit/charts': pkg('charts'),
  '@mdxkit/flow': pkg('flow'),
  '@mdxkit/pdf': pkg('pdf'),
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
          name: 'studio',
          root: path.resolve(root, 'apps/studio'),
          // storage.ts talks to localStorage.
          environment: 'jsdom',
          include: ['tests/**/*.test.ts'],
        },
      },
    ],
  },
});
