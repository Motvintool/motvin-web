'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { DEFAULT_PLATFORM } from '@/lib/inspirations/filters';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { PLATFORMS, type Industry, type Platform } from '@/lib/inspirations/types';
import { AppsGrid } from '../AppsGrid';
import { FilterPill, NavPill, SortPill, ToolbarRow, type SortOption } from '../FilterToolbar';
import { PageHeading } from '../PageHeading';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

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

  // Validated against all known platforms, not just those in the library, so
  // a header switch to a platform with no apps yet shows an honest empty
  // state instead of silently ignoring the filter. No param means the iOS
  // default — the same real default every feed and the header nav use.
  const rawPlatform = params.get('platform');
  const platform = PLATFORMS.includes(rawPlatform as Platform) ? (rawPlatform as Platform) : DEFAULT_PLATFORM;

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

  const visible = (apps ?? []).filter((app) => app.platforms.includes(platform));

  return (
    <>
      <PageHeading title="Apps" />

      <ToolbarRow
        total={loading ? null : visible.length}
        unit="app"
        right={<SortPill value={sort} options={APP_SORTS} onChange={(next) => setParam('sort', next === 'curated' ? undefined : next)} />}
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
        <FilterPill
          label="Platform"
          options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] ?? p }))}
          selected={[platform]}
          onToggle={(v) => setParam('platform', v === DEFAULT_PLATFORM ? undefined : v)}
          onClear={() => setParam('platform')}
          multi={false}
          clearable={false}
        />
      </ToolbarRow>

      {/* "Filtered" means an explicit choice beyond the defaults — a category,
          or a platform actually present in the URL; the iOS default isn't a
          filter the visitor can clear. */}
      <AppsGrid
        apps={visible}
        loading={loading}
        emptyTitle={industry || params.get('platform') ? 'No apps match these filters' : 'No apps in the library yet'}
        emptyDescription={
          industry || params.get('platform')
            ? undefined
            : 'Apps appear here once their screens are added to the store and approved for publishing.'
        }
        emptyAction={
          industry || params.get('platform')
            ? {
                label: 'Show all apps',
                onClick: () => {
                  const sp = new URLSearchParams(params.toString());
                  sp.delete('industry');
                  sp.delete('platform');
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
