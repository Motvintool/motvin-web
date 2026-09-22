'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { inspirationsApi, type Page, type ScreenSort } from '@/lib/inspirations/api';
import { EMPTY_FILTERS, parseFilters, serializeFilters, toggleValue, withDefaultPlatform, type ScreenFilters } from '@/lib/inspirations/filters';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import { PLATFORMS, type App, type ContentKind, type Industry, type LibraryCounts, type Platform, type Screen } from '@/lib/inspirations/types';
import { AppsGrid } from './AppsGrid';
import { EmptyState } from './EmptyState';
import { FilterPill, FilterToolbar, NavPill, SortPill, ToolbarRow, type SortOption } from './FilterToolbar';
import { ImageIcon } from './Icons';
import { ScreenGrid } from './ScreenGrid';
import { useAsync } from './useAsync';
import { useExploreFilters } from './useExploreFilters';
import { useMeta } from './useMeta';

/**
 * Explore browses apps, not raw screens — like Mobbin's own home feed. These
 * are the ways to order that app feed; "curated" sends no `sort` param at
 * all, which is the manifest's own build-time order (most screens first).
 * Apps do carry a real `rating`/`ratingCount` (see App in types.ts), unlike
 * Screen, so "Top Rated" has real data to sort by even though every demo app
 * is unrated right now — it's a fine order, just not a distinguishing one yet.
 */
type ExploreAppSort = 'curated' | 'newest' | 'oldest' | 'rating';
const EXPLORE_SORTS: SortOption<ExploreAppSort>[] = [
  { value: 'curated', label: 'Curated' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'rating', label: 'Top rated' },
];

/**
 * Screens-feed orders, for the toolbar's sort dropdown. "Most popular" is the
 * store's curated order — the manifest's own build-time ranking — which is
 * the closest thing the library has to popularity until real usage data
 * exists to rank by.
 */
const SCREEN_SORTS: SortOption<ScreenSort>[] = [
  { value: 'curated', label: 'Most popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'app', label: 'By app' },
];

/**
 * Apps have no screenType/style of their own, so those two ScreenFilters
 * dimensions can't narrow the app feed — industry, platform and the search
 * query all map onto real App fields and are applied below.
 */
function appMatchesFilters(app: App, filters: ScreenFilters): boolean {
  if (filters.industries.length && !filters.industries.includes(app.industry)) return false;
  if (filters.platforms.length && !filters.platforms.some((p) => app.platforms.includes(p))) return false;
  const q = filters.query.trim().toLowerCase();
  if (q && !app.name.toLowerCase().includes(q) && !(app.tagline ?? '').toLowerCase().includes(q)) return false;
  return true;
}

/**
 * The filter toolbar and the gallery beneath it, all bound to the URL.
 *
 * Explore (`active` unset) browses apps: its toolbar offers only the
 * dimensions an app feed can honor (Categories, Platform) plus the app-sort
 * dropdown. Screens/UI Elements (`active` set) browse the screens feed with
 * the full dimension set.
 *
 * Screens pages are keyed by the serialised filter string, so a response only
 * renders when it belongs to the current filters — a late reply for a
 * previous filter set is ignored.
 */

type Pages = { key: string; items: Screen[]; total: number; next: number | null };

export function FilteredGallery({
  appId,
  counts,
  active,
}: {
  appId?: string;
  counts: LibraryCounts | null;
  active?: ContentKind;
}) {
  const { filters, update } = useExploreFilters();
  const meta = useMeta();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Explore has no ContentKind of its own (there's no "Explore" tab to mark
  // active), so `active` unset is exactly "this is Explore, browse apps" —
  // the Screens page is the only other caller and always passes `active`.
  const exploreMode = !active;

  // Sort lives in its own query param rather than on ScreenFilters — every
  // other page that uses that type (Screens, Apps, UI Elements, ...) has no
  // use for a sort toggle, so it stays local to the one view that does.
  const setUrlParam = (name: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(name, value);
    else params.delete(name);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const rawSort = searchParams.get('sort');
  const sort: ExploreAppSort = EXPLORE_SORTS.some((s) => s.value === rawSort) ? (rawSort as ExploreAppSort) : 'curated';
  const setSort = (next: ExploreAppSort) => setUrlParam('sort', next === 'curated' ? null : next);

  // The screens feed's own sort and its single-select UI-element dimension,
  // both living in the URL like every other filter. Unknown values fall back
  // to the defaults instead of breaking the fetch.
  const screenSort: ScreenSort = SCREEN_SORTS.some((s) => s.value === rawSort) ? (rawSort as ScreenSort) : 'curated';
  // `kind` is the param several pages still link with (?kind=list from
  // Explore, saved items, app detail) — accepted as an alias here and
  // normalised to `element` on the next write.
  const rawElement = searchParams.get('element') ?? searchParams.get('kind');
  const element = rawElement && meta.taxonomy.elements.includes(rawElement) ? rawElement : null;

  const setElement = (next: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('kind');
    if (next) params.set('element', next);
    else params.delete('element');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Clears every screens-feed dimension — including `element`, which lives
  // outside ScreenFilters — in one URL write; two writes in a row would each
  // start from the same stale params and undo each other.
  const clearScreens = () => {
    const params = serializeFilters({ ...EMPTY_FILTERS, query: filters.query }, new URLSearchParams(searchParams.toString()));
    params.delete('element');
    params.delete('kind');
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const key = `${appId ?? ''}|${serializeFilters(filters).toString()}|${element ?? ''}|${screenSort}`;

  const [pages, setPages] = useState<Pages>({ key: ' ', items: [], total: 0, next: null });
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (exploreMode) return; // Explore renders AppsGrid, not this screens feed.
    let cancelled = false;
    const [, query, keyElement, keySort] = key.split('|');
    inspirationsApi
      .listScreens(withDefaultPlatform(parseFilters(new URLSearchParams(query))), 0, (keySort as ScreenSort) || 'curated', {
        app: appId,
        element: keyElement || undefined,
      })
      .then((page: Page<Screen>) => {
        if (cancelled) return;
        setPages({ key, items: page.items, total: page.total, next: page.nextOffset });
      })
      .catch(() => {
        if (!cancelled) setPages({ key, items: [], total: 0, next: null });
      });
    return () => {
      cancelled = true;
    };
  }, [key, appId, exploreMode]);

  const ready = pages.key === key;

  const loadMore = useCallback(() => {
    if (!ready || pages.next === null || loadingMore) return;
    setLoadingMore(true);
    const [, query, keyElement, keySort] = key.split('|');
    inspirationsApi
      .listScreens(withDefaultPlatform(parseFilters(new URLSearchParams(query))), pages.next, (keySort as ScreenSort) || 'curated', {
        app: appId,
        element: keyElement || undefined,
      })
      .then((page) => {
        setPages((prev) =>
          prev.key !== key
            ? prev
            : { key, items: [...prev.items, ...page.items], total: page.total, next: page.nextOffset },
        );
      })
      .finally(() => setLoadingMore(false));
  }, [ready, pages.next, loadingMore, key, appId]);

  const items = ready ? pages.items : [];
  const libraryEmpty = meta.counts.screens === 0;

  const { data: allApps, loading: appsLoading } = useAsync<App[]>(
    () => (exploreMode ? inspirationsApi.listApps(undefined, sort === 'curated' ? undefined : sort) : Promise.resolve([])),
    `filtered-gallery-apps:${exploreMode}:${sort}`,
  );
  const apps = allApps?.filter((a) => appMatchesFilters(a, withDefaultPlatform(filters))) ?? [];
  const appsLibraryEmpty = meta.counts.apps === 0;

  // The only ScreenFilters dimensions an app feed can't honor.
  const droppedFilterCount = filters.screenTypes.length + filters.styles.length;

  return (
    <>
      {exploreMode ? (
        <>
          <ToolbarRow
            total={allApps ? apps.length : null}
            unit="app"
            right={<SortPill value={sort} options={EXPLORE_SORTS} onChange={setSort} />}
          >
            <NavPill counts={counts} />
            <FilterPill
              label="Categories"
              options={meta.taxonomy.industries.map((v) => ({ value: v, label: INDUSTRY_LABEL[v as Industry] ?? v }))}
              selected={filters.industries}
              onToggle={(v) => update({ industries: toggleValue(filters.industries, v as Industry) })}
              onClear={() => update({ industries: [] })}
            />
            <FilterPill
              label="Platform"
              options={PLATFORMS.map((v) => ({ value: v, label: PLATFORM_LABEL[v] ?? v }))}
              selected={[filters.platforms[0] ?? 'ios']}
              onToggle={(v) => update({ platforms: v === 'ios' ? [] : [v as Platform] })}
              onClear={() => update({ platforms: [] })}
              multi={false}
              clearable={false}
            />
          </ToolbarRow>
          {droppedFilterCount > 0 && (
            <p className="ins-muted ins-explore-hint">
              Screen type and style filters don&apos;t apply to apps — clear them to narrow further.
            </p>
          )}
          <AppsGrid
            apps={apps}
            loading={appsLoading}
            emptyTitle={appsLibraryEmpty ? 'No apps in the library yet' : 'No apps match these filters'}
            emptyDescription={
              appsLibraryEmpty
                ? 'Apps appear here once their screens are added to the store and approved for publishing.'
                : 'Try removing a filter, or search for something broader.'
            }
          />
        </>
      ) : (
        <>
          <FilterToolbar
            filters={filters}
            onChange={update}
            element={element}
            onElement={setElement}
            total={ready ? pages.total : null}
            sort={screenSort}
            sortOptions={SCREEN_SORTS}
            onSort={(next) => setUrlParam('sort', next === 'curated' ? null : next)}
            counts={counts}
          />
          {/* .ins-shot-panel applies the app-page gallery treatment: five
              frameless, hairline-bordered shots per row. */}
          <div className="ins-shot-panel">
            <ScreenGrid
              screens={items}
              showMeta={false}
              selectable
              loading={!ready || loadingMore}
              hasMore={ready && pages.next !== null}
              onLoadMore={loadMore}
              empty={
                libraryEmpty ? (
                  <EmptyState
                    icon={<ImageIcon size={22} />}
                    title="No screens in the library yet"
                    description="Screens appear here once they are added to the store in motvin-backend and approved for publishing."
                  />
                ) : (
                  <EmptyState
                    title="No screens match these filters"
                    description="Try removing a filter, or search for something broader."
                    action={{ label: 'Clear filters', onClick: clearScreens }}
                  />
                )
              }
            />
          </div>
        </>
      )}
    </>
  );
}
