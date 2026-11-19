import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

const raiz = document.getElementById('root');
if (!raiz) throw new Error('No se encontró #root');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);



if (navigator.storage?.persist) {
  navigator.storage.persisted().then((ya) => (ya ? true : navigator.storage.persist())).catch(() => false);
}


if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {

    });
  });
}
