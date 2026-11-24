'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms, isWebsPlatforms } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { Screen } from '@/lib/inspirations/types';
import { EmptyState } from '../EmptyState';
import { NavPill, SortPill, ToolbarRow, type SortOption } from '../FilterToolbar';
import { APPLIED_PILLS_MAX, AppliedFilterPills, FiltersPill, type FilterSection } from '../FiltersPanel';
import { PageHeading } from '../PageHeading';
import { PALETTE_PARAM, PaletteFilter } from '../PaletteFilter';
import { usePaletteApps } from '../usePaletteApps';
import { SITE_TYPE_PARAM, SiteGrid, siteTabContent, type SiteTab } from '../SitePages';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

type SiteSort = 'curated' | 'newest' | 'oldest' | 'site';
const SITE_SORTS: SortOption<SiteSort>[] = [
  { value: 'curated', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'site', label: 'By site' },
];

/**
 * /inspirations/sites — every site's full pages, or their sections, in one grid (Webs only): what the
 * Screens page is for Web Apps, with the same row of chips — the content pill (Webs › Full Pages / Sections),
 * the colour chip, Filters (page or section type) with the applied ones beside it, and the sort on the right. Each card
 * names its website and opens in the screen preview.
 */
export function SitesView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const meta = useMeta();
  const apps = useApps();
  const { data: pages } = useAsync(() => inspirationsApi.listSiteScreens('page', '', 1000), 'sites:page');
  const { data: sections } = useAsync(() => inspirationsApi.listSiteScreens('section', '', 1000), 'sites:section');
  const [openFilters, setOpenFilters] = useState(0);
  // The colour chip, as on Screens: the websites whose brand colour (their logo's) is one of those picked.
  const colour = usePaletteApps(['site']);

  // Sites are in Webs only. A link with no platform (an old or shared one) is Webs' own page; switched to iOS here,
  // the visitor goes to the Screens page (iPhone screens).
  const inWebs = isWebsPlatforms(browsedPlatforms(params));
  const namesPlatform = params.has('platform');
  useEffect(() => {
    if (inWebs) return;
    if (namesPlatform) {
      router.replace(INSPIRATIONS_ROUTES.screens, { scroll: false });
      return;
    }
    const sp = new URLSearchParams(window.location.search);
    sp.set('platform', 'web');
    router.replace(`${INSPIRATIONS_ROUTES.sites}?${sp}`, { scroll: false });
  }, [inWebs, namesPlatform, router]);

  const tab: SiteTab = params.get('tab') === 'sections' ? 'sections' : 'full-page';
  const list = (name: string) => (params.get(name) ?? '').split(',').filter(Boolean);
  const types = list(SITE_TYPE_PARAM);
  const rawSort = params.get('sort');
  const sort: SiteSort = SITE_SORTS.some((s) => s.value === rawSort) ? (rawSort as SiteSort) : 'curated';
  // Every choice lives in the address, as on the Screens page; the tab comes from the content pill.
  const setParam = (name: string, values: string[] | string | null) => {
    const sp = new URLSearchParams(params.toString());
    const value = Array.isArray(values) ? values.join(',') : values;
    if (value) sp.set(name, value);
    else sp.delete(name);
    sp.set('platform', 'web');
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  const toggle = (name: string, now: string[], value: string) => setParam(name, now.includes(value) ? now.filter((v) => v !== value) : [...now, value]);

  const typeOf = (s: Screen) => (tab === 'sections' ? s.site?.sectionType : s.site?.pageType) ?? '';
  const content = siteTabContent([...(pages ?? []), ...(sections ?? [])], tab);
  const filterSections: FilterSection[] = [
    {
      key: 'type',
      label: tab === 'sections' ? 'Section type' : 'Page type',
      options: content.types.map((t) => ({ value: t.type, label: t.label, count: t.count })),
      selected: types,
      onToggle: (v: string) => toggle(SITE_TYPE_PARAM, types, v),
      onClear: () => setParam(SITE_TYPE_PARAM, null),
    },
  ].filter((section) => section.options.length > 0);

  const captured = (s: Screen) => s.capturedAt ?? s.version ?? '';
  const shown = content.list
    .filter((s) => (!types.length || types.includes(typeOf(s))) && (!colour.appIds || colour.appIds.has(s.appId)))
    .sort((a, b) =>
      sort === 'newest'
        ? captured(b).localeCompare(captured(a))
        : sort === 'oldest'
          ? captured(a).localeCompare(captured(b))
          : sort === 'site'
            ? (apps.get(a.appId)?.name ?? '').localeCompare(apps.get(b.appId)?.name ?? '')
            : 0,
    );
  const loading = !pages || !sections || !colour.ready;
  const unit = tab === 'sections' ? 'section' : 'page';

  return (
    <>
      {/* Named by what is on show, as the content pill names it ("Full Pages", "Sections"). */}
      <PageHeading title={tab === 'sections' ? 'Sections' : 'Full Pages'} />
      <ToolbarRow total={null} right={<SortPill value={sort} options={SITE_SORTS} onChange={(next) => setParam('sort', next === 'curated' ? null : next)} />}>
        <NavPill counts={meta.counts} activeCount={loading ? null : shown.length} />
        <PaletteFilter selected={colour.palette} onChange={colour.setPalette} counts={colour.counts} align="start" />
        <FiltersPill
          sections={filterSections}
          onClearAll={() => {
            const sp = new URLSearchParams(params.toString());
            sp.delete(SITE_TYPE_PARAM);
            sp.delete(PALETTE_PARAM);
            router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
          }}
          total={loading ? null : shown.length}
          unit={unit}
          openSignal={openFilters}
        />
        <AppliedFilterPills sections={filterSections} max={APPLIED_PILLS_MAX} onMore={() => setOpenFilters((n) => n + 1)} />
      </ToolbarRow>
      <section className="ins-tabpanel ins-shot-panel ins-site-panel">
        {loading ? null : (
          <SiteGrid
            screens={shown}
            apps={apps}
            tab={tab}
            empty={<EmptyState play title={tab === 'sections' ? 'No site sections match' : 'No site pages match'} description="Try removing a filter." />}
          />
        )}
      </section>
    </>
  );
}
