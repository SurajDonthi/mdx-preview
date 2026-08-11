/**
 * The client is bundled by esbuild, which resolves a CSS import to a bundled
 * stylesheet. TypeScript needs telling that such an import is legal; the app
 * gets this from `vite/client`, and this package does not depend on Vite.
 */
declare module '*.css';
