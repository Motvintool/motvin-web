import type { Metadata } from 'next';
import { browsedPlatforms, isWebsPlatforms, WEBS_PARAM } from '@/lib/inspirations/filters';

/**
 * Link previews: what a Motvin link shows when it's pasted into WhatsApp, Slack, LinkedIn or X — a picture
 * (public/og-image.jpg, 1200 × 630, the same for every page), a title and a line of description.
 *
 * Next.js replaces a parent's `openGraph` / `twitter` with a page's own rather than merging them, so a page
 * that sets its own title passes it through pageMetadata() to keep the picture, site name and card type too.
 */

/** The live site's address, which turns the preview image's path into the full link the apps need. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://motvin.com';

const SHARE_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Motvin — real UI screens, flows and patterns from top apps' };

/**
 * A page's title and description, for its tab and for its link preview alike.
 *
 * `path` is the page's one address for search engines (its canonical link, and the link preview's URL): a page
 * passes it, a layout never does — a layout's canonical would be inherited by every page under it that sets none.
 */
export function pageMetadata(title: string, description: string, path?: string): Metadata {
  return {
    title,
    description,
    ...(path ? { alternates: { canonical: path } } : {}),
    openGraph: { siteName: 'Motvin', type: 'website', locale: 'en_US', title, description, images: [SHARE_IMAGE], ...(path ? { url: path } : {}) },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_IMAGE] },
  };
}

/** Who runs the site and what it's called, for the home page: search results show this name and logo for Motvin. */
export const SITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Motvin',
      url: SITE_URL,
      logo: `${SITE_URL}/apple-touch-icon.png`,
      sameAs: ['https://www.instagram.com/motvintool/', 'https://www.linkedin.com/company/motvin/'],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Motvin',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

/** A page's place in the site ("Motvin › Apps › Canva"), each step a name and a path; the last is the page itself. */
export function breadcrumbJsonLd(steps: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: steps.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: `${SITE_URL}${step.path === '/' ? '' : step.path}`,
    })),
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * A library page's address for search engines: the page in the section it shows — iOS bare, Webs as
 * `?platform=web` — with every filter, sort and search left off, so all of a section's filtered views count as one
 * page. iOS and Webs stay two pages: they show different screens.
 */
export function sectionPath(path: string, searchParams: SearchParams): string {
  const raw = searchParams.platform;
  const platform = Array.isArray(raw) ? raw[0] : raw;
  const inWebs = isWebsPlatforms(browsedPlatforms({ get: (name) => (name === 'platform' ? platform ?? null : null) }));
  return inWebs ? `${path}?platform=${WEBS_PARAM}` : path;
}

/** generateMetadata for a library page shown in both sections (iOS and Webs): see sectionPath. */
export function sectionMetadata(path: string, title: string, description: string) {
  return async ({ searchParams }: { searchParams: Promise<SearchParams> }): Promise<Metadata> =>
    pageMetadata(title, description, sectionPath(path, await searchParams));
}
