'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  DEFAULT_SORT,
  parseLibraryParams,
  type LibraryParams,
} from '@/lib/api/libraryParams';

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

export type { LibraryParams } from '@/lib/api/libraryParams';
export { DEFAULT_SORT } from '@/lib/api/libraryParams';

const LIST_KEYS = ['sources', 'styles', 'categories', 'licenses'] as const;

export function useLibraryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The same parsing the server uses for its first page (lib/api/libraryParams).
  const params = useMemo<LibraryParams>(
    () => parseLibraryParams((key) => searchParams.get(key)),
    [searchParams],
  );

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
