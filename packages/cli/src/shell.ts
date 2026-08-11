import { API_PREFIX } from './protocol';
import type { BootData } from './protocol';

/** `</script>` inside a JSON island ends the island. */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The page the server returns for every document URL. It carries no content:
 * the client fetches the document it was asked for and renders it with the
 * same `MdxRenderer` the web application uses.
 *
 * The inline style block is the pre-hydration paint only - background and a
 * centred spinner - so a slow first chunk does not flash white on a dark theme.
 */
export function renderShell(boot: BootData, documentTitle: string): string {
  // The two light presets in `THEMES`; everything else is dark. Named here
  // rather than imported so the Node half stays free of the React packages.
  const dark = boot.theme !== 'github-light' && boot.theme !== 'editorial';
  const background = dark ? '#020617' : '#ffffff';
  const foreground = dark ? '#94a3b8' : '#475569';

  return `<!doctype html>
<html lang="en" data-mdxstudio-theme="${dark ? 'dark' : 'light'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="${dark ? 'dark light' : 'light dark'}">
<meta name="robots" content="noindex">
<title>${escapeHtml(documentTitle)}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128196;</text></svg>">
<link rel="stylesheet" href="${API_PREFIX}/client/main.css">
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: ${background}; }
  #mdxstudio-boot { display: flex; align-items: center; justify-content: center; height: 100vh;
    font: 500 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color: ${foreground}; }
</style>
</head>
<body>
<div id="root"><div id="mdxstudio-boot">Loading ${escapeHtml(boot.label)}...</div></div>
<script type="application/json" id="mdxstudio-boot-data">${safeJson(boot)}</script>
<script type="module" src="${API_PREFIX}/client/main.js"></script>
</body>
</html>
`;
}
