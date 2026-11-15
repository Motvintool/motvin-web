'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { freshFirst } from '@/lib/inspirations/appFreshness';
import { browsedPlatforms, isWebsPlatforms } from '@/lib/inspirations/filters';
import { INDUSTRY_LABEL, WEBS_APPS_LABEL } from '@/lib/inspirations/taxonomy';
import { hueOf, type PaletteHue } from '@/lib/inspirations/hues';
import { isDesktopPlatform, type Industry } from '@/lib/inspirations/types';
import { AppsGrid } from '../AppsGrid';
import { FilterPill, NavPill, SortPill, ToolbarRow, type SortOption } from '../FilterToolbar';
import { APPLIED_PILLS_MAX, AppliedFilterPills, FiltersPill } from '../FiltersPanel';
import { PageHeading } from '../PageHeading';
import { PALETTE_PARAM, PaletteFilter, readPaletteParam } from '../PaletteFilter';
import { APP_FILTER_PARAMS, useAppFilters } from '../useAppFilters';
import { useAsync } from '../useAsync';
import { useLogoTints } from '../useLogoTint';
import { useLibrarySettings, useMeta } from '../useMeta';

/**
 * "Curated" is the backend's default order (no sort param sent) — the
 * manifest's own ranking, apps with the most screens first.
 */
type AppSort = 'curated' | 'newest' | 'oldest' | 'az' | 'rating';
const APP_SORTS: SortOption<AppSort>[] = [
  { value: 'curated', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'az', label: 'A–Z' },
  { value: 'rating', label: 'Top rated' },
];

/**
 * /inspirations/apps — every app that has screens in the store, behind the
 * same toolbar as the other browse pages. Industry filters via the API (one
 * category per request); platform narrows client-side against each app's own
 * platform list, so the header's platform switch carries into this page too.
 */
export function AppsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();

  const industries = meta.taxonomy.industries as Industry[];
  const rawIndustry = params.get('industry');
  const industry = industries.includes(rawIndustry as Industry) ? (rawIndustry as Industry) : undefined;

  // The section being browsed: iOS by default, or Webs (websites and web apps
  // together) — the same platforms every feed and the header nav use.
  const platforms = browsedPlatforms(params);

  const rawSort = params.get('sort');
  const sort: AppSort = APP_SORTS.some((s) => s.value === rawSort) ? (rawSort as AppSort) : 'curated';

  const setParam = (key: string, value?: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data: apps, loading } = useAsync(
    () => inspirationsApi.listApps(industry, sort === 'curated' ? undefined : sort),
    `apps:${industry ?? 'all'}:${sort}`,
  );

  // In the default order, newly added apps lead, then updated ones; a sort the visitor picks is kept as is.
  const freshness = useLibrarySettings().freshness;
  const onPlatform = (apps ?? []).filter((app) => app.platforms.some((p) => platforms.includes(p)));
  const appFilters = useAppFilters(onPlatform);
  // Palette, as on Explore: only the apps whose brand colour (their logo's) is one of the picked ones.
  const palette = readPaletteParam(params.get(PALETTE_PARAM));
  const tints = useLogoTints(appFilters.filtered);
  const paletteApps = palette.length ? appFilters.filtered.filter((app) => palette.includes(hueOf(tints.get(app.id)))) : appFilters.filtered;
  const paletteCounts = appFilters.filtered.reduce<Partial<Record<PaletteHue, number>>>((counts, app) => {
    if (tints.get(app.id) === undefined) return counts;
    const hue = hueOf(tints.get(app.id));
    counts[hue] = (counts[hue] ?? 0) + 1;
    return counts;
  }, {});
  // "+N more" beside the applied filters opens the Filters panel.
  const [openFilters, setOpenFilters] = useState(0);
  const visible = sort === 'curated' ? freshFirst(paletteApps, freshness, undefined, platforms) : paletteApps;
  const narrowed = Boolean(industry || appFilters.active || palette.length);

  return (
    <>
      <PageHeading title={isWebsPlatforms(platforms) ? WEBS_APPS_LABEL : 'Apps'} />

      {/* No running count on the app list. */}
      <ToolbarRow
        total={null}
        unit="app"
        right={
          <>
            <PaletteFilter selected={palette} onChange={(next) => setParam(PALETTE_PARAM, next.join(','))} counts={paletteCounts} />
            <FiltersPill sections={appFilters.sections} onClearAll={appFilters.clear} total={visible.length} unit="app" atEnd onOpenChange={appFilters.onPanelOpen} openSignal={openFilters} />
          </>
        }
      >
        <NavPill counts={meta.counts} />
        <FilterPill
          label="Categories"
          options={industries.map((i) => ({ value: i, label: INDUSTRY_LABEL[i] ?? i }))}
          selected={industry ? [industry] : []}
          onToggle={(v) => setParam('industry', v === industry ? undefined : v)}
          onClear={() => setParam('industry')}
          multi={false}
        />
        <SortPill value={sort} options={APP_SORTS} onChange={(next) => setParam('sort', next === 'curated' ? undefined : next)} asPill />
        <AppliedFilterPills sections={appFilters.sections} max={APPLIED_PILLS_MAX} onMore={() => setOpenFilters((n) => n + 1)} />
      </ToolbarRow>

      {/* "Filtered" means an explicit choice beyond the defaults — a category,
          or a platform actually present in the URL; the iOS default isn't a
          filter the visitor can clear. */}
      <AppsGrid
        apps={visible}
        loading={loading}
        webLayout={platforms.every(isDesktopPlatform)}
        platforms={platforms}
        emptyTitle={narrowed || params.get('platform') ? 'No apps match these filters' : 'No apps here yet'}
        emptyPlay={Boolean(narrowed || params.get('platform'))}
        emptyDescription={
          narrowed || params.get('platform')
            ? undefined
            : 'We add new apps regularly. Check back soon.'
        }
        emptyAction={
          narrowed || params.get('platform')
            ? {
                label: narrowed ? 'Clear filters' : 'Show all apps',
                onClick: () => {
                  // The category, the colours and every app filter go; Apps / Webs stays, unless it was the only narrowing.
                  const sp = new URLSearchParams(params.toString());
                  for (const key of ['industry', PALETTE_PARAM, ...APP_FILTER_PARAMS, ...(narrowed ? [] : ['platform'])]) sp.delete(key);
                  const qs = sp.toString();
                  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                },
              }
            : undefined
        }
      />
    </>
  );
}
