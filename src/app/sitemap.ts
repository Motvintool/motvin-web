import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config/share';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';

/**
 * /sitemap.xml: every public page, so search engines find them all — the
 * landing and info pages, the library's browse pages, the icon libraries, and
 * one page per app (read from the Inspirations API, refreshed hourly). Pages
 * that are per visitor (settings, collections, admin) and the sign-in pages
 * are left out.
 */

export const revalidate = 3600;

const PAGES: { path: string; priority: number; changeFrequency: 'daily' | 'weekly' | 'monthly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: INSPIRATIONS_ROUTES.explore, priority: 0.9, changeFrequency: 'daily' },
  { path: '/inspirations/apps', priority: 0.9, changeFrequency: 'daily' },
  { path: '/inspirations/screens', priority: 0.9, changeFrequency: 'daily' },
  { path: '/inspirations/ui-elements', priority: 0.8, changeFrequency: 'daily' },
  { path: '/inspirations/flows', priority: 0.8, changeFrequency: 'daily' },
  { path: '/inspirations/patterns', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/icons', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/logos', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/illustrations', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/updates', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'monthly' },
  { path: '/copyrights', priority: 0.3, changeFrequency: 'monthly' },
];

function apiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
  return `${configured || 'https://api.motvin.com'}/api/inspirations`;
}

/** The library's apps, or none when the API can't be reached (the fixed pages still go out). */
async function appSlugs(): Promise<string[]> {
  try {
    const res = await fetch(`${apiBase()}/apps`, { next: { revalidate } });
    if (!res.ok) return [];
    const envelope = (await res.json()) as { data?: { slug?: string }[] };
    return (envelope.data ?? []).flatMap((app) => (app.slug ? [app.slug] : []));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slugs = await appSlugs();
  return [
    ...PAGES.map(({ path, priority, changeFrequency }) => ({ url: `${SITE_URL}${path === '/' ? '' : path}`, priority, changeFrequency })),
    ...slugs.map((slug) => ({
      url: `${SITE_URL}${INSPIRATIONS_ROUTES.app({ slug })}`,
      priority: 0.7,
      changeFrequency: 'weekly' as const,
    })),
  ];
}
