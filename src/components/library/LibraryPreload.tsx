'use client';

import { preload } from 'react-dom';
import { getApiClient } from '@/lib/api/client';
import { PAGE_SIZE, type Category } from '@/lib/config/categories';

/**
 * Starts library requests from the page's <head>, for whatever the server
 * render didn't already put in the page (LibraryView decides which).
 *
 *
 * The grid fetches its data from effects, which only run once the page's
 * JavaScript has downloaded and started — on a phone over 4G that was ~1.8s of
 * a ~2.2s wait for the first icons, with the API itself answering in under
 * 100ms. These hints let the browser fetch stats, the source list and the
 * default first page while that JavaScript is still loading; the client's own
 * fetches then reuse those responses. Same URLs as the client builds (its
 * *Url helpers), and crossOrigin "anonymous" to match plain fetch() requests.
 *
 * The page is prerendered without its query string, so only the default view
 * gets a first-page hint; a filtered link fetches as before.
 */
export function LibraryPreload({
  category,
  only,
}: {
  category: Category;
  /** Just these URLs; without it, stats, collections and the default first page. */
  only?: string[];
}) {
  const client = getApiClient(category);
  const options = { as: 'fetch', crossOrigin: 'anonymous' } as const;
  const urls = only ?? [
    client.statsUrl(),
    client.collectionsUrl(),
    client.searchUrl('', { limit: PAGE_SIZE, offset: 0 }),
  ];
  for (const url of urls) preload(url, options);
  return null;
}
