'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { EMPTY_META, inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms } from '@/lib/inspirations/filters';
import type { LibraryMeta } from '@/lib/inspirations/types';
import { useAsync } from './useAsync';

/**
 * Counts and the taxonomy present in the store *for the platform being
 * browsed* — the URL's `?platform=`, or iOS when it names none, the same
 * default every feed and the header nav use. Choosing Web therefore offers
 * Web's own screen types, categories, UI elements and flow categories, and
 * its own tab counts, instead of the union across every platform.
 *
 * Cached by the API client per platform, so the tabs, filter chips and page
 * titles on a page share one request. While another platform's answer is
 * loading the previous one stays up rather than flashing to empty, so a
 * switch never briefly reads as "the library is empty". `loading` is true
 * until the answer for the current platform has arrived.
 *
 * Reads the URL, so callers sit under a Suspense boundary like every other
 * page that does.
 */
export function usePlatformMeta(): { meta: LibraryMeta; loading: boolean } {
  const params = useSearchParams();
  const platforms = browsedPlatforms(params);
  const key = platforms.join(',');
  const { data } = useAsync(() => inspirationsApi.getMeta(platforms), `meta:${key}`);

  const [shown, setShown] = useState<LibraryMeta | null>(null);
  if (data && data !== shown) setShown(data);

  return { meta: data ?? shown ?? EMPTY_META, loading: data === null };
}

/**
 * Returns empty counts while loading and when the store is empty — callers
 * render "0" or hide the count rather than showing a number that is not real.
 */
export function useMeta(): LibraryMeta {
  return usePlatformMeta().meta;
}
