import type { Metadata } from 'next';

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

/** A page's title and description, for its tab and for its link preview alike. */
export function pageMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
    openGraph: { siteName: 'Motvin', type: 'website', locale: 'en_US', title, description, images: [SHARE_IMAGE] },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_IMAGE] },
  };
}
