import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config/share';

/**
 * /robots.txt: search engines may read every page except the per-visitor ones
 * (settings, collections, admin) and the API routes, and are pointed at the
 * sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/inspirations/admin', '/inspirations/settings', '/inspirations/collections'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
