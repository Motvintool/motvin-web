/**
 * Google Analytics, loaded only once the visitor has allowed it (the cookie
 * banner's "Accept All", or analytics ticked in its settings). CookieBanner,
 * on every page, loads it.
 */

export const COOKIE_PREF_KEY = 'motvin_cookie_preference';
/** Sent on the document when the visitor makes their cookie choice. */
export const CONSENT_EVENT = 'motvin:cookie-consent';
const GA_MEASUREMENT_ID = 'G-4DTKXD35BH';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initializeGoogleAnalytics() {
  if (window.gtag) return; // Already injected this session.

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  // gtag.js only reads commands pushed as the call's own `arguments` object; a plain array (from
  // `...args`) is skipped, so nothing would ever be sent.
  const gtag = function (this: unknown) {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as (...args: unknown[]) => void;
  window.gtag = gtag;

  gtag('js', new Date());
  gtag('config', GA_MEASUREMENT_ID);
}

/**
 * Records one thing a visitor did (signing up, saving a screen, …) as a Google
 * Analytics event. Nothing is sent unless Analytics is loaded, which it only
 * is for a visitor who allowed it.
 */
export function track(event: string, params?: Record<string, string | number>) {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', event, params);
}
