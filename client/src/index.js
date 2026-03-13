import './utils/logger';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initCapacitor } from './capacitor-init';
import './index.css';

initCapacitor();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ErrorBoundary><App /></ErrorBoundary>);

// Register service worker for offline app shell (production only, not on Capacitor mobile)
if (
  'serviceWorker' in navigator &&
  process.env.NODE_ENV === 'production' &&
  !window.Capacitor?.isNativePlatform?.()
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').then((registration) => {
      // Auto-activate new versions
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        }
      });

      // Check for updates every 60 minutes
      setInterval(() => registration.update(), 60 * 60 * 1000);
    });
  });
}
