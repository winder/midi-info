// Google Analytics (GA4). Loads gtag.js at runtime so index.html stays free of
// inline JS. Only the public GitHub Pages host reports; the local dev server
// and the e2e harness never load the tag.

// GA4 measurement ID (Admin > Data streams > Web, e.g. 'G-XXXXXXXXXX').
// Baked in at build time from the GA_MEASUREMENT_ID env var via esbuild
// --define (see package.json); CI sets it from the GitHub Actions repository
// variable of the same name. Empty (the local default) disables analytics.
declare const __GA_MEASUREMENT_ID__: string;
export const GA_MEASUREMENT_ID: string = __GA_MEASUREMENT_ID__;

const TRACKED_HOSTS = ['winder.github.io'];

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export function shouldTrack(hostname: string, measurementId: string = GA_MEASUREMENT_ID): boolean {
  return measurementId !== '' && TRACKED_HOSTS.includes(hostname);
}

export function initAnalytics(): void {
  if (!shouldTrack(window.location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}
