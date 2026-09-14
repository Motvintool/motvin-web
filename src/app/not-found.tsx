/**
 * App-level not-found — every unknown route (and every `notFound()` call in
 * server components) renders this inline, without changing the URL. So a
 * request to `/jdjd` keeps `/jdjd` in the browser bar and shows the 404
 * page below it, matching what a traditional web server does.
 *
 * The markup lives in `./404/page.tsx` so the page is also directly
 * reachable at `/404`; this file re-exports it so Next uses the same
 * component for its not-found fallback.
 */
export { default } from './404/page';
