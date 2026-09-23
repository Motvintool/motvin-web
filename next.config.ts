import type { NextConfig } from 'next';

/**
 * Route map for this app — folder paths never appear in the URL bar:
 *
 *   /              — landing page (src/app/page.tsx re-exports
 *                    src/app/landing/page.tsx)
 *   /icons         — library (rewritten internally to
 *                    src/app/motvin-library/[category]/page.tsx)
 *   /logos         — same, → /motvin-library/logos
 *   /illustrations — same, → /motvin-library/illustrations
 *   /login /signup — React auth pages (already at root)
 *   /404           — React 404 page (src/app/404/page.tsx)
 *
 * Visitors who deep-link to a folder path (/landing, /motvin-library/icons)
 * or a legacy alias (/icon, /iconstore) are 308-redirected to the short URL,
 * so the app keeps ONE canonical URL per page.
 *
 * Any other legacy pages (/files, /about-me, …) are still owned by the
 * original static site. LEGACY_ORIGIN, when set, proxies those through so this
 * app can own the whole domain during a phased cutover.
 */
const LEGACY_ORIGIN = process.env.LEGACY_ORIGIN?.replace(/\/+$/, '');

/** Static-site paths this app doesn't serve locally yet. */
const LEGACY_PATHS = [
  'files',
  'about-me',
  'my-post',
  'my-post-detail',
  'saved-templates',
  'discover-templates',
  'filter-template',
  'mobile-template',
  'web-template',
  'product-detail',
];

/** Short URL ↔ folder path pairs — one place to add a new category. */
const LIBRARY_REWRITES = [
  { short: '/icons', folder: '/motvin-library/icons' },
  { short: '/logos', folder: '/motvin-library/logos' },
  { short: '/illustrations', folder: '/motvin-library/illustrations' },
];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Canonicalise every folder-path URL back to the short form so the
      // browser bar never shows /motvin-library/… or /landing even if someone
      // deep-links to one.
      ...LIBRARY_REWRITES.map(({ short, folder }) => ({
        source: folder,
        destination: short,
        permanent: true,
      })),
      { source: '/landing', destination: '/', permanent: true },
      // Legacy aliases from the original static site.
      { source: '/icon', destination: '/icons', permanent: true },
      { source: '/iconstore', destination: '/icons', permanent: true },
      { source: '/iconstores', destination: '/icons', permanent: true },
      // The updates feed used to live at /release-notes; preserve any shared
      // links by 308-redirecting to the new canonical /updates URL.
      { source: '/release-notes', destination: '/updates', permanent: true },
      { source: '/release-notes/:rest*', destination: '/updates/:rest*', permanent: true },
      // /inspirations/saved (the flat "everything bookmarked" list) and
      // /inspirations/collections (organized boards) used to be two separate
      // routes for one feature — confusing as two competing destinations.
      // They're merged into /inspirations/collections (?type=all for the
      // flat list); any surviving link to the old URL lands there, with its
      // query string (e.g. ?collection=id) carried over automatically.
      { source: '/inspirations/saved', destination: '/inspirations/collections', permanent: true },
    ];
  },

  async rewrites() {
    // beforeFiles: the short library URLs rewrite to the real page location
    // BEFORE Next checks the public/ folder or the app router, so /icons
    // is served by src/app/motvin-library/[category]/page.tsx while the URL
    // bar stays "/icons".
    const libraryRewrites = LIBRARY_REWRITES.map(({ short, folder }) => ({
      source: short,
      destination: folder,
    }));

    if (!LEGACY_ORIGIN) {
      return { beforeFiles: libraryRewrites, afterFiles: [], fallback: [] };
    }
    return {
      beforeFiles: libraryRewrites,
      afterFiles: [
        ...LEGACY_PATHS.flatMap((path) => [
          { source: `/${path}`, destination: `${LEGACY_ORIGIN}/${path}` },
          { source: `/${path}/:rest*`, destination: `${LEGACY_ORIGIN}/${path}/:rest*` },
        ]),
        { source: '/MOTVIN/:rest*', destination: `${LEGACY_ORIGIN}/MOTVIN/:rest*` },
        { source: '/motvin/:rest*', destination: `${LEGACY_ORIGIN}/MOTVIN/:rest*` },
        // /updates is now served locally by src/app/updates/, so it is no
        // longer proxied to the legacy site. /update and /releasenote(s) stay
        // as aliases in case anyone still deep-links to them.
        { source: '/update', destination: '/updates' },
        { source: '/releasenote', destination: '/updates' },
        { source: '/releasenotes', destination: '/updates' },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
