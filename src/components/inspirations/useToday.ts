'use client';

import { useSyncExternalStore } from 'react';
import { localDateString, utcDateString } from '@/lib/inspirations/dates';

const subscribeToNothing = () => () => {};

/**
 * Today (`YYYY-MM-DD`) for what a page shows by date — the "Latest"/"Updated" badges and newest-first order.
 *
 * The visitor's own calendar day once the page is running. While the server renders and the browser takes the
 * page over (hydration) both use the UTC day instead: the server can't know the visitor's day, and two different
 * days would put a badge or an app in a different place, which React rejects. The page settles on the local day
 * right after.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribeToNothing, () => localDateString(), () => utcDateString());
}
