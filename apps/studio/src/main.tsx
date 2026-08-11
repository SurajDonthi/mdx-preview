import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';

// The component packages ship real CSS. They are imported before the app's own
// sheet so anything the app wants to override still comes last.
import '@mdxstudio/react/styles.css';
import '@mdxstudio/mermaid/styles.css';
import '@mdxstudio/charts/styles.css';
import '@mdxstudio/flow/styles.css';
import '@mdxstudio/tasks/styles.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
