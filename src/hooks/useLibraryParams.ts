'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

/**
 * Search, filters, sort and page, held in the URL.
 *
 * The static site kept all of this in localStorage only, so a filtered view
 * couldn't be linked or shared and the back button stepped past the whole page
 * rather than through filter changes. Putting it in the query string fixes
 * both; localStorage still mirrors it (see useLibraryState) so a returning
 * visitor lands where they left off.
 *
 * Params are omitted when empty, so the default view stays a clean `/icons`.
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

const LIST_KEYS = ['sources', 'styles', 'categories', 'licenses'] as const;

function parseList(value: string | null): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

export function useLibraryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo<LibraryParams>(() => {
    const rawPage = parseInt(searchParams.get('page') ?? '1', 10);
    return {
      query: searchParams.get('q') ?? '',
      page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
      sources: parseList(searchParams.get('sources')),
      styles: parseList(searchParams.get('styles')),
      categories: parseList(searchParams.get('categories')),
      licenses: parseList(searchParams.get('licenses')),
      sort: searchParams.get('sort') ?? DEFAULT_SORT,
      saved: searchParams.get('saved') === '1',
    };
  }, [searchParams]);

  const setParams = useCallback(
    (patch: Partial<LibraryParams>, options: { replace?: boolean } = {}) => {
      const next = { ...params, ...patch };
      const search = new URLSearchParams();

      if (next.query) search.set('q', next.query);
      for (const key of LIST_KEYS) {
        if (next[key].length) search.set(key, next[key].join(','));
      }
      if (next.sort && next.sort !== DEFAULT_SORT) search.set('sort', next.sort);
      if (next.saved) search.set('saved', '1');

      // Any change to what's being searched invalidates the page number, unless
      // the caller is explicitly setting it.
      const resetsPage = Object.keys(patch).some((key) => key !== 'page');
      const page = patch.page ?? (resetsPage ? 1 : next.page);
      if (page > 1) search.set('page', String(page));

      const queryString = search.toString();
      const url = queryString ? `${pathname}?${queryString}` : pathname;

      // Typing in the search box replaces rather than pushes, so the back
      // button doesn't have to walk back through every keystroke.
      if (options.replace) {
        router.replace(url, { scroll: false });
      } else {
        router.push(url, { scroll: false });
      }
    },
    [params, pathname, router],
  );

  return { params, setParams };
}
