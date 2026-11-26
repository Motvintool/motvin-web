'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { freshFirst, newThisWeek } from '@/lib/inspirations/appFreshness';
import { browsedPlatforms, isWebsPlatforms } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL, WEBS_APPS_LABEL } from '@/lib/inspirations/taxonomy';
import { hueOf, type PaletteHue } from '@/lib/inspirations/hues';
import { isDesktopPlatform, type Industry, type Platform } from '@/lib/inspirations/types';
import { AppsGrid } from '../AppsGrid';
import { FilterPill, NavPill, SortPill, ToolbarRow, type SortOption } from '../FilterToolbar';
import { APPLIED_PILLS_MAX, AppliedFilterPills, FiltersPill } from '../FiltersPanel';
import { PageHeading } from '../PageHeading';
import { PALETTE_PARAM, PaletteFilter, readPaletteParam } from '../PaletteFilter';
import { APP_FILTER_PARAMS, useAppFilters } from '../useAppFilters';
import { useAsync } from '../useAsync';
import { useLogoTints } from '../useLogoTint';
import { useLibrarySettings, useMeta } from '../useMeta';
import { useToday } from '../useToday';

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

/** On "New this week" the default order is the admin's (Library admin → Week’s new apps), not popularity. */
const WEEK_SORTS: SortOption<AppSort>[] = [{ value: 'curated', label: 'Featured' }, ...APP_SORTS.slice(1)];

/**
 * /inspirations/apps — every app that has screens in the store, behind the
 * same toolbar as the other browse pages. Industry filters via the API (one
 * category per request); platform narrows client-side against each app's own
 * platform list, so the header's platform switch carries into this page too.
 *
 * `week` is /inspirations/new: the same page and toolbar over only the apps
 * the admin picked for it (newThisWeek) — in their order by default.
 */
export function AppsView({ week = false }: { week?: boolean }) {
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
  const sorts = week ? WEEK_SORTS : APP_SORTS;
  const sort: AppSort = sorts.some((s) => s.value === rawSort) ? (rawSort as AppSort) : 'curated';

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
  const settings = useLibrarySettings();
  const freshness = settings.freshness;
  const today = useToday();
  // In Webs, the content menu's Web Apps (`?show=webapps`) and Webs (`?show=sites`, websites) each list their own;
  // with neither, Webs lists both.
  const show = isWebsPlatforms(platforms) ? params.get('show') : null;
  const showOnly: Platform | null = show === 'webapps' ? 'webapp' : show === 'sites' || show === 'webs' ? 'site' : null;
  const inSection = (apps ?? []).filter((app) => app.platforms.some((p) => platforms.includes(p) && (!showOnly || p === showOnly)));
  // New this week: only the apps the admin picked — in their order in the default sort, the list's own in any other.
  const weekApps = week ? newThisWeek(inSection, settings.newThisWeek, platforms) : [];
  const weekIds = new Set(weekApps.map((app) => app.id));
  const onPlatform = !week ? inSection : sort === 'curated' ? weekApps : inSection.filter((app) => weekIds.has(app.id));
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
  const visible = sort === 'curated' && !week ? freshFirst(paletteApps, freshness, today, platforms) : paletteApps;
  const narrowed = Boolean(industry || appFilters.active || palette.length);

  return (
    <>
      <PageHeading
        title={week ? 'New this week\u2004🎉' : showOnly === 'webapp' ? 'Web Apps' : showOnly === 'site' ? 'Sites' : isWebsPlatforms(platforms) ? 'Web Apps & Sites' : 'Apps'}
        eyebrow={
          week && !loading
            ? `${visible.length} ${visible.length === 1 ? 'app' : 'apps'} added this week`
            : undefined
        }
      />

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
        <SortPill value={sort} options={sorts} onChange={(next) => setParam('sort', next === 'curated' ? undefined : next)} asPill />
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
        emptyTitle={
          narrowed || (params.get('platform') && !week) ? 'No apps match these filters' : week ? 'No new apps this week' : 'No apps here yet'
        }
        emptyPlay={Boolean(narrowed || (params.get('platform') && !week))}
        emptyDescription={
          narrowed || (params.get('platform') && !week)
            ? undefined
            : week
              ? 'We add new apps every week. Check back soon.'
              : 'We add new apps regularly. Check back soon.'
        }
        emptyAction={
          week && !narrowed
            ? {
                label: 'Browse all apps',
                href: `${INSPIRATIONS_ROUTES.apps}${params.get('platform') ? `?platform=${params.get('platform')}` : ''}`,
              }
            : narrowed || params.get('platform')
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
