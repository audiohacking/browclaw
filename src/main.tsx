// ---------------------------------------------------------------------------
// browclaw — React entry point
// ---------------------------------------------------------------------------

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './app.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
