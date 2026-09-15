'use client';

import { useMemo } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { App } from '@/lib/inspirations/types';
import { useAsync } from './useAsync';

/**
 * The app list, keyed by id. The API client caches the response, so every
 * gallery on a page shares one request rather than resolving app names card
 * by card.
 */
export function useApps(): Map<string, App> {
  const { data } = useAsync(() => inspirationsApi.listApps(), 'apps:all');
  return useMemo(() => new Map((data ?? []).map((app) => [app.id, app])), [data]);
}
