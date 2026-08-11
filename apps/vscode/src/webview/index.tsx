/**
 * The preview webview's entry point.
 *
 * The package stylesheets are imported first, exactly as `apps/studio` does, so
 * the shell sheet below can override them. esbuild collects all four into one
 * `dist/webview/main.css`, which the HTML loads through `asWebviewUri()`.
 */
import '@mdxstudio/react/styles.css';
import '@mdxstudio/mermaid/styles.css';
import '@mdxstudio/charts/styles.css';
import '@mdxstudio/flow/styles.css';
import './shell.css';

import { createRoot } from 'react-dom/client';

import { PreviewApp } from './PreviewApp';
import { post } from './vscodeApi';

// Anything that escapes React's error boundary still has to reach somebody:
// a webview's console is two clicks away in a window the user is not looking at.
window.addEventListener('error', (event) => {
  post({ type: 'error', message: event.message });
});
window.addEventListener('unhandledrejection', (event) => {
  post({ type: 'error', message: String((event as PromiseRejectionEvent).reason) });
});

const host = document.getElementById('mdxstudio-preview-root');
if (host) {
  // Deliberately not `StrictMode`: its double-invoked effects would render every
  // Mermaid diagram twice, and Mermaid's render queue is global.
  createRoot(host).render(<PreviewApp />);
}
