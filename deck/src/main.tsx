import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

// Self-hosted fonts (no external font hosts; brief req. 7). Licenses in ASSETS.md.
import '@fontsource/archivo/400.css';
import '@fontsource/archivo/600.css';
import '@fontsource/archivo/700.css';
import '@fontsource/archivo/800.css';
import '@fontsource/archivo-black/400.css';
import '@fontsource/permanent-marker/400.css';
import '@fontsource/lexend/400.css';
import '@fontsource/lexend/600.css';

import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/forms.css';

import { App } from './App';

if (import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
