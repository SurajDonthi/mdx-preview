import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import type { BootData } from '../protocol';
import { App } from './App';

/*
 * The stylesheets the packages ship come first, then this client's own shell
 * sheet, so the shell can override them. Same order as `apps/studio/src/main.tsx`.
 */
import '@mdxstudio/react/styles.css';
import '@mdxstudio/mermaid/styles.css';
import '@mdxstudio/charts/styles.css';
import '@mdxstudio/flow/styles.css';
import '@mdxstudio/tasks/styles.css';
import './styles.css';

const FALLBACK: BootData = {
  path: '',
  label: 'documents',
  root: '',
  single: false,
  watch: false,
  expressions: 'full',
  theme: 'github-dark',
  themePinned: false,
  version: '0.0.0',
  configFile: null,
};

function readBoot(): BootData {
  const island = document.getElementById('mdxstudio-boot-data');
  if (!island?.textContent) return FALLBACK;
  try {
    return { ...FALLBACK, ...(JSON.parse(island.textContent) as Partial<BootData>) };
  } catch {
    return FALLBACK;
  }
}

const container = document.getElementById('root');
if (container) {
  container.innerHTML = '';
  createRoot(container).render(
    <StrictMode>
      <App boot={readBoot()} />
    </StrictMode>
  );
}
