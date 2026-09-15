'use client';

import { EMPTY_META, inspirationsApi } from '@/lib/inspirations/api';
import type { LibraryMeta } from '@/lib/inspirations/types';
import { useAsync } from './useAsync';

/**
 * Counts and the taxonomy present in the store. Cached by the API client, so
 * the header tabs, filter chips and page titles share one request.
 *
 * Returns empty counts while loading and when the store is empty — callers
 * render "0" or hide the count rather than showing a number that is not real.
 */
export function useMeta(): LibraryMeta {
  const { data } = useAsync(() => inspirationsApi.getMeta(), 'meta');
  return data ?? EMPTY_META;
}
