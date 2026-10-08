import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppShell } from './app-shell';

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <AppShell />
    </StrictMode>,
  );
}
