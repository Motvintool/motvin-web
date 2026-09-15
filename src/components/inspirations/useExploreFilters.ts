'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  EMPTY_FILTERS,
  parseFilters,
  serializeFilters,
  type ScreenFilters,
} from '@/lib/inspirations/filters';

/**
 * Filter state bound to the URL. Reading is a pure parse of the current
 * search params; writing replaces the URL (no history spam for chip toggles)
 * so Back returns to the previous page rather than the previous filter.
 */
export function useExploreFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const setFilters = useCallback(
    (next: ScreenFilters, { push = false }: { push?: boolean } = {}) => {
      const params = serializeFilters(next, new URLSearchParams(searchParams.toString()));
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const update = useCallback(
    (patch: Partial<ScreenFilters>) => setFilters({ ...filters, ...patch }),
    [filters, setFilters],
  );

  const clear = useCallback(() => setFilters({ ...EMPTY_FILTERS, query: filters.query }), [filters.query, setFilters]);

  return { filters, setFilters, update, clear };
}
