import type { Category } from '@/lib/config/categories';
import { LibraryApiClient } from './client';
import { parseLibraryParams, resultsKey } from './libraryParams';
import { loadItems } from './load';
import { PAGE_SIZE } from '@/lib/config/categories';
import type { LibraryItem } from './normalize';
import { summarizeStats, type LibraryStats } from './stats';

/**
 * The library's first page, fetched on the server so it arrives inside the
 * HTML.
 *
 * Without this the grid waited for the page's JavaScript before even asking
 * for items: ~2s of placeholders on a phone over 4G, with the API answering in
 * under 100ms. Now the cards are in the page the browser receives, and the
 * client picks them up instead of fetching (LibraryResults, useLibraryStats).
 *
 * Never worse than before: on a slow or failing backend it gives up after
 * TIMEOUT_MS and returns null, and the browser loads exactly as it used to.
 */

export type InitialLibrary = {
  /** resultsKey() of the params this page was fetched for. */
  key: string;
  /** Null when the server didn't fetch items (Saved view, or the request failed). */
  results: {
    items: LibraryItem[];
    total: number;
    /**
     * False when the page was cut to the size budget: the client shows these
     * cards at once and fetches the full page to append the rest.
     */
    complete: boolean;
    /** When incomplete: the full page's URL, for the page to preload. */
    fullPageUrl?: string;
  } | null;
  stats: LibraryStats | null;
};

const TIMEOUT_MS = 1200;

/**
 * The cards travel twice — as HTML and as the data React hydrates from — so a
 * heavy page would arrive slower than fetching it. Sixty icons are ~44KB and
 * sixty logos ~170KB, both well inside; sixty illustrations are ~1.2MB, so
 * only their first screenful ships with the page.
 */
const ITEMS_BUDGET_BYTES = 250_000;

function withinBudget(items: LibraryItem[]): LibraryItem[] {
  let used = 0;
  const kept: LibraryItem[] = [];
  for (const item of items) {
    used += JSON.stringify(item).length;
    if (used > ITEMS_BUDGET_BYTES && kept.length > 0) break;
    kept.push(item);
  }
  return kept;
}

function timeout(): Promise<null> {
  return new Promise((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS));
}

export async function loadInitialLibrary(
  category: Category,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<InitialLibrary | null> {
  const get = (key: string) => {
    const value = searchParams[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
  const params = parseLibraryParams(get);
  // A client per request (see LoadParams.client).
  const client = new LibraryApiClient(category);

  const statsRequest = client
    .getStats()
    .then(summarizeStats)
    .catch(() => null);

  // The Saved view lists ids kept in the visitor's browser, so only the
  // browser can fetch it; the server still sends the counts.
  const itemsRequest = params.saved
    ? Promise.resolve(null)
    : loadItems({
        category,
        query: params.query,
        page: params.page,
        sources: params.sources,
        styles: params.styles,
        categories: params.categories,
        licenses: params.licenses,
        client,
        noRetry: true,
      }).catch(() => null);

  const loaded = await Promise.race([Promise.all([statsRequest, itemsRequest]), timeout()]);
  if (!loaded) return null;
  const [stats, result] = loaded;
  if (!stats && !result) return null;

  const items = result ? withinBudget(result.items) : [];
  const complete = Boolean(result) && items.length === result!.items.length;
  return {
    key: resultsKey(category, params),
    results: result
      ? {
          items,
          total: result.total,
          complete,
          // The URL loadItems will request for the rest — same builder, so a
          // preload of it is reused.
          ...(complete
            ? {}
            : {
                fullPageUrl: client.searchUrl(params.query.trim(), {
                  limit: PAGE_SIZE,
                  offset: (params.page - 1) * PAGE_SIZE,
                  collection: params.sources,
                  style: params.styles,
                  category: params.categories,
                  license: params.licenses,
                }),
              }),
        }
      : null,
    stats,
  };
}
