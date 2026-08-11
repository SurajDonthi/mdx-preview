/**
 * A stylesheet imported from a module is the bundler's business, not
 * TypeScript's. An application gets this declaration from `vite/client`; this
 * package does not depend on Vite, so it declares it itself.
 */
declare module '*.css';
