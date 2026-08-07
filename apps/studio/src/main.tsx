import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';

// The component packages ship real CSS. They are imported before the app's own
// sheet so anything the app wants to override still comes last.
import '@mdxkit/react/styles.css';
import '@mdxkit/mermaid/styles.css';
import '@mdxkit/charts/styles.css';
import '@mdxkit/flow/styles.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
