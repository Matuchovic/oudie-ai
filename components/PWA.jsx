'use client';

import { useEffect } from 'react';

/* Registers the service worker after load rather than during it: doing it
   earlier competes with the first paint for exactly the moment that matters
   most, and the app has to work without it anyway. */
export default function PWA() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // An unregistrable worker is not an error worth showing anyone.
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register, { once: true });
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
