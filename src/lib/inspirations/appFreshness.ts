import type { App, LibrarySettings } from './types';
import { localDateString } from './dates';

/** How long an app counts as "Latest", or "Updated" after a new version, in days — until the admin's Settings say otherwise. */
export const DEFAULT_FRESHNESS: LibrarySettings['freshness'] = { newDays: 14, updatedDays: 14 };

export type AppFreshness = 'new' | 'updated';

export const APP_FRESHNESS_LABEL: Record<AppFreshness, string> = {
  new: 'Latest',
  updated: 'Updated',
};

/** Whole days from one `YYYY-MM-DD` to another (calendar days, not hours). */
function daysBetween(from: string, to: string): number {
  const day = (id: string) => {
    const [y, m, d] = id.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1) / 86_400_000;
  };
  return Math.round(day(to) - day(from));
}

/**
 * Whether an app is fresh in the library, from its dated versions (captures):
 * "new" when its first version is from the last `newDays` days, "updated"
 * when an older app got a new version in the last `updatedDays`. At most one —
 * a new app isn't also "updated". Null for anything older, or an app with no
 * versions.
 */
export function appFreshness(
  app: Pick<App, 'versions'>,
  days: LibrarySettings['freshness'] = DEFAULT_FRESHNESS,
  today: string = localDateString(),
): AppFreshness | null {
  const dates = versionDates(app);
  if (!dates.length) return null;
  const within = (id: string, limit: number) => {
    const age = daysBetween(id, today);
    return age >= 0 && age <= limit;
  };
  if (within(dates[0], days.newDays)) return 'new';
  if (dates.length > 1 && within(dates[dates.length - 1], days.updatedDays)) return 'updated';
  return null;
}

const FRESH_RANK: Record<AppFreshness, number> = { new: 0, updated: 1 };

/** An app's dated versions, oldest first. */
function versionDates(app: Pick<App, 'versions'>): string[] {
  return (app.versions ?? []).map((v) => v.id).filter((id) => /^\d{4}-\d{2}-\d{2}$/.test(id)).sort();
}

/**
 * Latest apps first, then updated ones, then the rest. Within the first
 * two, newest first — by the date that earned the tag (a new app's first
 * version, an updated app's latest). The rest keep the order they came in, so
 * the list's own ranking still applies to them.
 */
export function freshFirst<T extends Pick<App, 'versions'>>(
  apps: T[],
  days: LibrarySettings['freshness'] = DEFAULT_FRESHNESS,
  today: string = localDateString(),
): T[] {
  const ranked = apps.map((app, i) => {
    const fresh = appFreshness(app, days, today);
    const dates = versionDates(app);
    const since = fresh === 'new' ? dates[0] : fresh === 'updated' ? dates[dates.length - 1] : '';
    return { app, i, r: fresh ? FRESH_RANK[fresh] : 2, since };
  });
  return ranked
    .sort((a, b) => a.r - b.r || b.since.localeCompare(a.since) || a.i - b.i)
    .map((x) => x.app);
}
