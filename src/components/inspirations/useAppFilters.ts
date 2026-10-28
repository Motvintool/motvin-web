'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { appFreshness, type AppFreshness } from '@/lib/inspirations/appFreshness';
import { localDateString } from '@/lib/inspirations/dates';
import { browsedPlatforms, isWebsPlatforms } from '@/lib/inspirations/filters';
import type { StoreStats } from '@/lib/inspirations/storeStats';
import { elementLabel, flowCategoryLabel, screenTypeLabel, styleLabel } from '@/lib/inspirations/taxonomy';
import type { App, Platform } from '@/lib/inspirations/types';
import type { FilterSection } from './FiltersPanel';
import { useAsync } from './useAsync';
import { useLibrarySettings } from './useMeta';
import { loadStoreStats } from './useStoreStats';

/**
 * Each section's URL param. Distinct from the screen filters' own (`type`, `style`, `element`, …), so a
 * filter set on the Screens page never leaks into the app list or back.
 */
const PARAM = {
  fresh: 'fresh',
  site: 'site',
  screens: 'screens',
  ui: 'ui',
  flows: 'flows',
  looks: 'looks',
  rating: 'rating',
  price: 'price',
  chart: 'chart',
  store: 'appstore',
  size: 'size',
  versions: 'versions',
} as const;
type Key = keyof typeof PARAM;

/** Every URL param the app filters own, for a page clearing them along with its own in one write. */
export const APP_FILTER_PARAMS: string[] = Object.values(PARAM);

/**
 * How picks inside one section combine. "any": an app matching one of them stays (Latest or Updated, Free
 * or Paid). "all": what an app holds, where each pick narrows further (has a Paywall *and* Onboarding
 * screens). "one": a single threshold, a new pick replaces the old (4.0+).
 */
const MODE: Record<Key, 'any' | 'all' | 'one'> = {
  fresh: 'any',
  site: 'any',
  screens: 'all',
  ui: 'all',
  flows: 'all',
  looks: 'all',
  rating: 'one',
  price: 'any',
  chart: 'any',
  store: 'any',
  size: 'one',
  versions: 'any',
};

const RATINGS = [
  { value: '4', label: '4.0+', min: 4 },
  { value: '4.5', label: '4.5+', min: 4.5 },
];
const SIZES = [
  { value: '50', label: '50+ screens', min: 50 },
  { value: '100', label: '100+ screens', min: 100 },
  { value: '250', label: '250+ screens', min: 250 },
];
/** "Updated this month" on the App Store: a release within this many days. */
const STORE_RECENT_DAYS = 30;

/** What the library holds for one app, on the platforms being browsed: the facets the content sections test. */
type Facets = { screens: Set<string>; ui: Set<string>; flows: Set<string>; looks: Set<string> };

type Test = (app: App) => boolean;
type Option = { value: string; label: string; test: Test };


function daysAgo(iso: string | null | undefined, today: string): number | null {
  if (!iso) return null;
  const d = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`) / 86_400_000;
  return Math.round(d(today) - d(iso));
}

/**
 * The app lists' advanced filters (Explore and the Apps page), in the "Filters" panel, bound to the URL.
 *
 * - From the library itself — what each app's stored screens, flows and styles hold (fetched per app with
 *   the app's own record, the same request its card already makes): Screens, UI elements, Flows, Style,
 *   plus the capture's size and version history, and the Latest / Updated tags.
 * - From the App Store (iOS only, looked up through the store-stats cache once the panel opens or a store
 *   filter is in the URL): rating, price, top-chart rank, a recent release.
 *
 * Every option shows how many apps picking it would leave, given everything else that's picked.
 */
export function useAppFilters(apps: App[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const freshDays = useLibrarySettings().freshness;
  const platforms = browsedPlatforms(params);
  const webs = isWebsPlatforms(platforms);
  const today = localDateString();
  const [panelOpen, setPanelOpen] = useState(false);

  const picked = Object.fromEntries(
    (Object.keys(PARAM) as Key[]).map((k) => [k, (params.get(PARAM[k]) ?? '').split(',').filter(Boolean)]),
  ) as Record<Key, string[]>;
  // "Has flows" was `flows=1` before the panel listed flow categories.
  picked.flows = picked.flows.map((v) => (v === '1' ? 'any' : v));

  // What each app holds. Its record is the request AppsGrid already makes for the card, so this is cached.
  const ids = apps.map((a) => a.id).join(',');
  const { data: facets } = useAsync(async () => {
    const details = await Promise.all(apps.map((a) => inspirationsApi.getApp(a.id)));
    const on = (p: Platform) => platforms.includes(p);
    return new Map<string, Facets>(
      apps.map((a, i) => {
        const screens = (details[i]?.screens ?? []).filter((s) => on(s.platform));
        const flows = (details[i]?.flows ?? []).filter((f) => on(f.platform));
        return [
          a.id,
          {
            screens: new Set(screens.map((s) => s.screenType).filter((t) => t !== 'other')),
            ui: new Set(screens.flatMap((s) => s.elements)),
            flows: new Set(flows.map((f) => f.category).filter(Boolean)),
            looks: new Set(screens.flatMap((s) => s.style)),
          },
        ];
      }),
    );
  }, `app-facets:${platforms.join(',')}:${ids}`);

  // App Store numbers, iOS only: once the panel is open or a store filter is set.
  const storeKeys: Key[] = ['rating', 'price', 'chart', 'store'];
  const wantStore = !webs && (panelOpen || storeKeys.some((k) => picked[k].length));
  const iosApps = apps.filter((a) => a.platforms.includes('ios'));
  const { data: stats } = useAsync(async () => {
    if (!wantStore) return null;
    const all = await Promise.all(iosApps.map((a) => loadStoreStats(a.name)));
    return new Map<string, StoreStats | null>(iosApps.map((a, i) => [a.id, all[i]]));
  }, `app-store:${wantStore ? iosApps.map((a) => a.id).join(',') : ''}`);
  const store = (a: App) => stats?.get(a.id) ?? null;

  const has = (field: keyof Facets) => (value: string): Test => (a) => facets?.get(a.id)?.[field].has(value) ?? false;
  // A content section's options: every value some app holds, the most common first.
  const facetOptions = (field: keyof Facets, label: (v: string) => string): Option[] => {
    if (!facets) return [];
    const tally = new Map<string, number>();
    for (const f of facets.values()) for (const v of f[field]) tally.set(v, (tally.get(v) ?? 0) + 1);
    return [...tally.entries()]
      .sort((x, y) => y[1] - x[1] || label(x[0]).localeCompare(label(y[0])))
      .map(([value]) => ({ value, label: label(value), test: has(field)(value) }));
  };

  const groups: { key: Key; label: string; options: Option[]; show: boolean }[] = [
    {
      key: 'fresh',
      label: 'New in the library',
      show: true,
      options: (['new', 'updated'] as AppFreshness[]).map((value) => ({
        value,
        label: value === 'new' ? 'Latest' : 'Updated',
        test: (a) => appFreshness(a, freshDays, today, platforms) === value,
      })),
    },
    {
      key: 'site',
      label: 'Type',
      show: webs,
      options: [
        { value: 'webapp', label: 'Web Apps', test: (a) => a.platforms.includes('webapp') },
        { value: 'web', label: 'Websites', test: (a) => a.platforms.includes('web') },
      ],
    },
    { key: 'screens', label: 'Screens', show: true, options: facetOptions('screens', screenTypeLabel) },
    { key: 'ui', label: 'UI elements', show: true, options: facetOptions('ui', elementLabel) },
    {
      key: 'flows',
      label: 'Flows',
      show: true,
      options: [
        { value: 'any', label: 'Any flow', test: (a) => a.flowCount > 0 },
        ...facetOptions('flows', flowCategoryLabel),
      ],
    },
    { key: 'looks', label: 'Style', show: true, options: facetOptions('looks', styleLabel) },
    {
      key: 'size',
      label: 'Captured screens',
      show: true,
      options: SIZES.map((s) => ({ value: s.value, label: s.label, test: (a) => a.screenCount >= s.min })),
    },
    {
      key: 'versions',
      label: 'Version history',
      show: true,
      options: [{ value: 'many', label: 'More than one version', test: (a) => (a.versions?.length ?? 0) > 1 }],
    },
    // From the App Store, together at the end (iOS only).
    {
      key: 'rating',
      label: 'App Store rating',
      show: !webs,
      options: RATINGS.map((r) => ({ value: r.value, label: r.label, test: (a) => (store(a)?.rating ?? 0) >= r.min })),
    },
    {
      key: 'chart',
      label: 'Top charts',
      show: !webs,
      options: [
        { value: 'category', label: 'Top 10 in category', test: (a) => (store(a)?.rank?.position ?? Infinity) <= 10 },
        { value: 'overall', label: 'Top 100 overall', test: (a) => (store(a)?.overallRank ?? Infinity) <= 100 },
      ],
    },
    {
      key: 'price',
      label: 'Price',
      show: !webs,
      options: [
        { value: 'free', label: 'Free', test: (a) => store(a)?.price === 'Free' },
        { value: 'paid', label: 'Paid', test: (a) => Boolean(store(a)?.price) && store(a)?.price !== 'Free' },
      ],
    },
    {
      key: 'store',
      label: 'App Store release',
      show: !webs,
      options: [
        {
          value: 'recent',
          label: 'Updated this month',
          test: (a) => (daysAgo(store(a)?.updated, today) ?? Infinity) <= STORE_RECENT_DAYS,
        },
      ],
    },
  ];
  const shown = groups.filter((g) => g.show);

  // A pick only counts once the data behind it is in; until then it rules nothing out.
  const ready = (key: Key) =>
    ['screens', 'ui', 'flows', 'looks'].includes(key) ? Boolean(facets) : storeKeys.includes(key) ? Boolean(stats) : true;
  const sectionTest = (g: (typeof groups)[number], values: string[]): Test => {
    const tests = values.map((v) => g.options.find((o) => o.value === v)?.test).filter((t): t is Test => Boolean(t));
    if (!tests.length || !ready(g.key)) return () => true;
    return MODE[g.key] === 'all' ? (a) => tests.every((t) => t(a)) : (a) => tests.some((t) => t(a));
  };
  const passes = (a: App, override?: { key: Key; values: string[] }) =>
    shown.every((g) => sectionTest(g, override?.key === g.key ? override.values : picked[g.key])(a));

  const write = (patch: Partial<Record<Key, string[]>>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [key, values] of Object.entries(patch) as [Key, string[]][]) {
      if (values.length) sp.set(PARAM[key], values.join(','));
      else sp.delete(PARAM[key]);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  // The picks a section would have after toggling `value`.
  const toggled = (key: Key, value: string) => {
    const cur = picked[key];
    if (cur.includes(value)) return cur.filter((v) => v !== value);
    return MODE[key] === 'one' ? [value] : [...cur, value];
  };

  const withPicked = (key: Key, value: string) =>
    picked[key].includes(value) ? picked[key] : MODE[key] === 'one' ? [value] : [...picked[key], value];

  const sections: FilterSection[] = shown.map((g) => {
    const known = ready(g.key);
    return {
      key: g.key,
      label: g.label,
      options: g.options.map((o) => ({
        value: o.value,
        label: o.label,
        // What the list would show with this option picked (added to the section, or replacing its pick).
        count: known ? apps.filter((a) => passes(a, { key: g.key, values: withPicked(g.key, o.value) })).length : undefined,
      })),
      selected: picked[g.key].filter((v) => g.options.some((o) => o.value === v)),
      onToggle: (value: string) => write({ [g.key]: toggled(g.key, value) }),
      onClear: () => write({ [g.key]: [] }),
    };
  });

  return {
    sections,
    filtered: apps.filter((a) => passes(a)),
    active: sections.reduce((n, s) => n + s.selected.length, 0),
    clear: () => write(Object.fromEntries((Object.keys(PARAM) as Key[]).map((k) => [k, []]))),
    onPanelOpen: setPanelOpen,
  };
}
