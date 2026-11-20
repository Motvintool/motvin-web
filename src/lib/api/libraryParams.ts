/**
 * Search, filters, sort and page as read from the query string.
 *
 * Shared by useLibraryParams (the browser) and the library page's server
 * render, which fetches the first page before sending the HTML: both must read
 * a URL the same way, or the server would render one page of results and the
 * browser would immediately ask for another.
 */

export type LibraryParams = {
  query: string;
  page: number;
  sources: string[];
  styles: string[];
  categories: string[];
  licenses: string[];
  sort: string;
  /** Right-panel "Saved" view. */
  saved: boolean;
};

// Matches the original's `localStorage.getItem("mi.sort") || "all"`.
export const DEFAULT_SORT = 'all';

function parseList(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/** `get` returns a query-string value or null, like URLSearchParams.get. */
export function parseLibraryParams(get: (key: string) => string | null): LibraryParams {
  const rawPage = parseInt(get('page') ?? '1', 10);
  return {
    query: get('q') ?? '',
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    sources: parseList(get('sources')),
    styles: parseList(get('styles')),
    categories: parseList(get('categories')),
    licenses: parseList(get('licenses')),
    sort: get('sort') ?? DEFAULT_SORT,
    saved: get('saved') === '1',
  };
}

/**
 * Identifies the result set a set of params asks for (sort is applied to the
 * page afterwards, so it isn't part of it). The server stamps its first page
 * with this; the browser only reuses that page when its own key matches.
 */
export function resultsKey(category: string, params: LibraryParams): string {
  return [
    category,
    params.query.trim(),
    params.page,
    params.sources.join(','),
    params.styles.join(','),
    params.categories.join(','),
    params.licenses.join(','),
    params.saved ? '1' : '0',
  ].join('|');
}
