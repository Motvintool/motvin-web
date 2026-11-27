import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config/share';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { WEBS_PARAM, WEBS_PLATFORMS } from '@/lib/inspirations/filters';
import type { App } from '@/lib/inspirations/types';
import { MCP_CLIENTS } from '@/lib/mcp/clients';

/**
 * /sitemap.xml: every public page, so search engines find them all — the
 * landing and info pages, the library's browse pages, the icon libraries, the
 * MCP setup guides, and one page per app (read from the Inspirations API,
 * refreshed hourly). Pages that are per visitor (settings, collections, admin),
 * search and the sign-in pages are left out.
 *
 * iOS and Webs are separate pages (each canonical to itself, see sectionPath),
 * so a browse page — and an app on both — is listed once per section.
 */

export const revalidate = 3600;

type Page = {
  path: string;
  priority: number;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  /** A library page: dated by the newest capture, and listed again for Webs when `webs` is set. */
  library?: { webs: boolean };
};

const PAGES: Page[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: INSPIRATIONS_ROUTES.explore, priority: 0.9, changeFrequency: 'daily', library: { webs: true } },
  { path: INSPIRATIONS_ROUTES.apps, priority: 0.9, changeFrequency: 'daily', library: { webs: true } },
  { path: INSPIRATIONS_ROUTES.newThisWeek, priority: 0.8, changeFrequency: 'daily', library: { webs: true } },
  { path: INSPIRATIONS_ROUTES.screens, priority: 0.9, changeFrequency: 'daily', library: { webs: true } },
  { path: INSPIRATIONS_ROUTES.uiElements, priority: 0.8, changeFrequency: 'daily', library: { webs: true } },
  { path: INSPIRATIONS_ROUTES.flows, priority: 0.8, changeFrequency: 'daily', library: { webs: true } },
  { path: INSPIRATIONS_ROUTES.patterns, priority: 0.8, changeFrequency: 'weekly', library: { webs: true } },
  // Sites are in Webs only: their one address already names it.
  { path: `${INSPIRATIONS_ROUTES.sites}?platform=${WEBS_PARAM}`, priority: 0.8, changeFrequency: 'daily', library: { webs: false } },
  // App Store screenshots are iOS only.
  { path: INSPIRATIONS_ROUTES.screenshots, priority: 0.7, changeFrequency: 'weekly', library: { webs: false } },
  { path: '/icons', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/logos', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/illustrations', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/updates', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/mcp', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/plugins', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/mcp/clients', priority: 0.5, changeFrequency: 'monthly' },
  ...MCP_CLIENTS.map((client): Page => ({ path: `/mcp/clients/${client.id}`, priority: 0.4, changeFrequency: 'monthly' })),
  { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/copyrights', priority: 0.3, changeFrequency: 'monthly' },
];

function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
  return `${configured || 'https://api.motvin.com'}/api/inspirations`;
}

type ListedApp = Pick<App, 'slug' | 'platforms' | 'versions'>;

/** The library's apps, or none when the API can't be reached (the fixed pages still go out). */
async function listedApps(): Promise<ListedApp[]> {
  try {
    const res = await fetch(`${apiBase()}/apps`, { next: { revalidate } });
    if (!res.ok) return [];
    const envelope = (await res.json()) as { data?: Partial<ListedApp>[] };
    return (envelope.data ?? []).flatMap((app) =>
      app.slug ? [{ slug: app.slug, platforms: app.platforms ?? [], versions: app.versions ?? [] }] : [],
    );
  } catch {
    return [];
  }
}

/** When an app last changed: its newest capture, or nothing when no date is stored. */
function newestCapture(app: ListedApp): Date | undefined {
  const dates = app.versions.map((v) => Date.parse(v.capturedAt)).filter((t) => !Number.isNaN(t));
  return dates.length ? new Date(Math.max(...dates)) : undefined;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const apps = await listedApps();
  const captures = apps.flatMap((app) => newestCapture(app) ?? []);
  // The library pages change whenever any app gets new screens.
  const libraryChanged = captures.length ? new Date(Math.max(...captures.map((d) => d.getTime()))) : undefined;
  const entry = (path: string, priority: number, changeFrequency: Page['changeFrequency'], lastModified?: Date) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    priority,
    changeFrequency,
    ...(lastModified ? { lastModified } : {}),
  });

  return [
    ...PAGES.flatMap(({ path, priority, changeFrequency, library }) => {
      if (!library) return [entry(path, priority, changeFrequency)];
      const pages = [entry(path, priority, changeFrequency, libraryChanged)];
      if (library.webs) pages.push(entry(`${path}?platform=${WEBS_PARAM}`, priority, changeFrequency, libraryChanged));
      return pages;
    }),
    ...apps.flatMap((app) => {
      const path = INSPIRATIONS_ROUTES.app(app);
      const lastModified = newestCapture(app);
      const onBoth = app.platforms.includes('ios') && app.platforms.some((p) => WEBS_PLATFORMS.includes(p));
      return [
        entry(path, 0.7, 'weekly', lastModified),
        ...(onBoth ? [entry(`${path}?platform=${WEBS_PARAM}`, 0.7, 'weekly', lastModified)] : []),
      ];
    }),
  ];
}
