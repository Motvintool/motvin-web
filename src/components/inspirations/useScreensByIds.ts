'use client';

import { useMemo } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { Screen } from '@/lib/inspirations/types';
import { useAsync } from './useAsync';

/**
 * Resolves saved or collected screen ids to records, keyed by id.
 *
 * An id that no longer exists in the store simply drops out — a screen removed
 * from the library disappears from Saved rather than rendering as a broken
 * card.
 */
export function useScreensByIds(ids: string[]): { screens: Map<string, Screen>; loading: boolean } {
  const key = ids.join(',');
  const { data, loading } = useAsync(
    () => (key ? inspirationsApi.getScreens(key.split(',')) : Promise.resolve([])),
    `screens-by-id:${key}`,
  );
  const screens = useMemo(() => new Map((data ?? []).map((s) => [s.id, s])), [data]);
  return { screens, loading: Boolean(key) && loading };
}
