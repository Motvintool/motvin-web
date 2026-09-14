/**
 * Root URL — re-exports the landing page from `src/app/landing/page.tsx` so
 * the URL bar shows `/` instead of `/landing`. The folder stays for code
 * organization; the URL is short. Paired with the /landing → / redirect in
 * next.config.ts so both point to the same canonical URL.
 */
export { default } from './landing/page';
