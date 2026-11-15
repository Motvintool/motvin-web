import { PAGE_SIZE, type Category } from '@/lib/config/categories';
import { getApiClient } from './client';
import { HIDDEN_SOURCES, normalizeItems, type LibraryItem } from './normalize';

/**
 * Fetches one page of results for the current filters — the port of
 * loadItemsFromAPI() in JS/api-loader.js (and its logos/illustrations twins).
 */

export type LoadParams = {
  category: Category;
  query: string;
  page: number;
  sources: string[];
  styles: string[];
  categories: string[];
  licenses: string[];
  /** When set, only these ids are fetched — the saved-collections view. */
  savedIds?: string[];
};

export type LoadResult = {
  items: LibraryItem[];
  total: number;
};

/**
 * A freshly-deployed backend answers with an empty index rather than an error
 * while it builds. The original retried with a linear backoff before giving up
 * and showing an empty grid; same here.
 */
const INDEX_BUILD_MAX_RETRIES = 10;
const INDEX_BUILD_RETRY_STEP_MS = 2000;
const INDEX_BUILD_RETRY_CAP_MS = 15000;

export class AbortedError extends Error {
  constructor() {
    super('Search superseded');
    this.name = 'AbortedError';
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export async function loadItems(params: LoadParams): Promise<LoadResult> {
  const { category, query, page, sources, styles, categories, licenses, savedIds } =
    params;

  const client = getApiClient(category);
  const limit = PAGE_SIZE;
  const offset = (page - 1) * limit;

  // Viewing saved items with nothing saved means an empty grid, not an
  // unfiltered fetch of the whole library.
  if (savedIds && savedIds.length === 0) {
    return { items: [], total: 0 };
  }

  const collections = await client.getCollections().catch(() => []);

  const hasFilters =
    sources.length > 0 ||
    styles.length > 0 ||
    categories.length > 0 ||
    licenses.length > 0;

  for (let attempt = 0; ; attempt++) {
    let result;
    try {
      result = await client.search(query.trim(), {
        limit,
        offset,
        collection: sources,
        style: styles,
        category: categories,
        license: licenses,
        ids: savedIds,
      });
    } catch (error) {
      // A newer search aborted this one. Propagate so the caller can drop the
      // result instead of rendering a stale page.
      if (isAbortError(error)) throw new AbortedError();
      throw error;
    }

    // The API's total counts every collection it indexed, including the ones
    // we hide (see HIDDEN_SOURCES in normalize.ts). Deduct those from the
    // total shown to the visitor so the "All" tab count and the pagination
    // match the number of items the grid actually renders.
    const rawTotal = result.total || 0;
    const hiddenTotal =
      hasFilters && sources.length > 0
        ? 0
        : (collections ?? []).reduce(
            (sum, c) =>
              HIDDEN_SOURCES.has(String(c.id ?? '').toLowerCase())
                ? sum + (c.total ?? 0)
                : sum,
            0,
          );
    const total = Math.max(0, rawTotal - hiddenTotal);

    // An empty result for an unfiltered, unsearched browse means the index
    // isn't ready yet, not that the library is empty.
    const looksLikeColdIndex =
      !query.trim() && !hasFilters && !savedIds && total === 0;

    if (looksLikeColdIndex && attempt < INDEX_BUILD_MAX_RETRIES) {
      const delay = Math.min(
        INDEX_BUILD_RETRY_STEP_MS * (attempt + 1),
        INDEX_BUILD_RETRY_CAP_MS,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    return {
      items: normalizeItems(result.results ?? [], category, collections),
      total,
    };
  }
}
