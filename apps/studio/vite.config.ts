import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const workspaceRoot = path.resolve(__dirname, '../..');
const pkg = (name: string) => path.resolve(workspaceRoot, `packages/${name}/src/index.ts`);
const pkgCss = (name: string) => path.resolve(workspaceRoot, `packages/${name}/src/styles.css`);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // The stylesheet entries come first: a bare package alias also matches
        // its subpaths, so `@mdxkit/react/styles.css` would otherwise be
        // rewritten to `.../src/index.ts/styles.css`.
        '@mdxkit/react/styles.css': pkgCss('react'),
        '@mdxkit/mermaid/styles.css': pkgCss('mermaid'),
        '@mdxkit/charts/styles.css': pkgCss('charts'),
        '@mdxkit/flow/styles.css': pkgCss('flow'),
        // Workspace packages are TypeScript source; resolve them explicitly so
        // Vite compiles them instead of treating them as prebundled deps.
        '@mdxkit/core': pkg('core'),
        '@mdxkit/react': pkg('react'),
        '@mdxkit/mermaid': pkg('mermaid'),
        '@mdxkit/charts': pkg('charts'),
        '@mdxkit/flow': pkg('flow'),
        '@mdxkit/pdf': pkg('pdf'),
        '@': path.resolve(__dirname, '.'),
      },
      // One React instance across every workspace package.
      dedupe: ['react', 'react-dom'],
    },
    server: {
      fs: {
        // The app root is apps/studio; package sources live above it.
        allow: [workspaceRoot],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
