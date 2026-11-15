'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms, matchesFilters, parseFilters, serializeFilters, toggleValue, type ScreenFilters } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { screenItemId } from '@/lib/inspirations/savedItems';
import { elementLabel, formatCount, INDUSTRY_LABEL, screenStateLabel, screenTypeLabel, styleLabel } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type App, type Industry, type Screen, type ScreenState, type ScreenType, type Style } from '@/lib/inspirations/types';
import { AppsGrid } from '../AppsGrid';
import { AppTreePill } from '../AppTreePill';
import { EmptyState } from '../EmptyState';
import { onMenuKeyDown, onTriggerKeyDown, ToolbarRow, useAutoFocusMenu, useDismiss } from '../FilterToolbar';
import { APPLIED_PILLS_MAX, AppliedFilterPills, FiltersPill, type FilterSection } from '../FiltersPanel';
import { FlowList } from '../FlowList';
import { ScreenshotTextSearch } from '../ScreenshotTextSearch';
import { SearchEmpty } from '../SearchEmpty';
import { CloseIcon, SearchIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { ScreenGrid } from '../ScreenGrid';
import { ScreenGridSkeleton } from '../Skeletons';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';
import { useScreensByIds } from '../useScreensByIds';
import { CheckboxFilterPill } from './AppDetailView';

type ResultKind = 'apps' | 'screens' | 'ui-elements' | 'patterns' | 'flows';

const KINDS: { id: ResultKind; label: string }[] = [
  { id: 'apps', label: 'Apps' },
  { id: 'screens', label: 'Screens' },
  { id: 'ui-elements', label: 'UI Elements' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'flows', label: 'Flows' },
];

/** The kinds whose results are screens, so the screen filters (type, state, element, style) apply to them. */
const SCREEN_KINDS: ResultKind[] = ['screens', 'ui-elements', 'patterns'];

/**
 * /inspirations/search?q=… — the same filter toolbar as Explore: the platform switch, a pill that picks the
 * result type (with counts), the screen filters, and the app picker and screenshot-text search on the right.
 * Filters are applied by the server, so paging ("Load more") always brings filtered screens.
 */
export function SearchView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();
  const apps = useApps();

  const query = params.get('q')?.trim() ?? '';
  const textSearch = params.get('mode') === 'text';
  // `view` picks the result type. Older links used `type` for that, which now belongs to the screen-type filter.
  const rawView = params.get('view') ?? params.get('type');
  const pickedKind = KINDS.some((k) => k.id === rawView) ? (rawView as ResultKind) : null;

  const filters: ScreenFilters = { ...parseFilters(params), platforms: browsedPlatforms(params) };
  // Webs (websites and web apps) are landscape screenshots: screen results use the web grid.
  const webGrid = filters.platforms.every(isDesktopPlatform);
  const elementFilter = (params.get('element') ?? '').split(',').filter((k) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(k));
  const appFilter = (params.get('app') ?? '').split(',').filter(Boolean);
  // A query that names a screen type, category, style or state ("login", "food checkout", "dark settings") is
  // turned into those filters, shown on the pills ("Login ⊗"), and the words are then searched as plain text
  // (`literal`). So nothing narrows the results invisibly: clearing "Login" shows every screen that mentions
  // "login".
  const literal = params.get('literal') === '1';
  const serverFilters = {
    platform: filters.platforms.join(','),
    type: filters.screenTypes.join(','),
    state: filters.states.join(','),
    industry: filters.industries.join(','),
    style: filters.styles.join(','),
    element: elementFilter.join(','),
    app: appFilter.join(','),
    // Once the words' meaning is in the filters (see below), the server reads them as plain text.
    literal: literal ? '1' : '',
  };
  // With the screenshot-text box on, the first request brings every result (up to the server's 200) so the text
  // match covers all of them, not just the first page.
  const textQuery = params.get('text')?.trim() ?? '';
  const searchKey = `${query}:${textSearch ? 'text' : 'all'}:${textQuery ? 'wide' : 'page'}:${JSON.stringify(serverFilters)}`;
  const { data: first, loading } = useAsync(
    () => inspirationsApi.search(query, textSearch ? 'text' : undefined, undefined, textQuery ? { limit: 200 } : undefined, serverFilters),
    `search:${searchKey}`,
  );

  // The first request brings 50 ranked screens; "Load more" (and scrolling to the end) fetches the next pages
  // and appends them. Pages are tied to the request they were loaded for, so changing anything starts over.
  type ExtraPages = { key: string; screens: Screen[]; highlights: NonNullable<typeof first>['textHighlights'] };
  const [pages, setPages] = useState<ExtraPages>({ key: '', screens: [], highlights: {} });
  // "+N more" beside the applied filters opens the Filters panel.
  const [openFilters, setOpenFilters] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const extra = pages.key === searchKey ? pages : null;
  const raw = first
    ? (() => {
        const seen = new Set(first.screens.map((s) => s.id));
        const added = (extra?.screens ?? []).filter((s) => !seen.has(s.id) && (seen.add(s.id), true));
        return { ...first, screens: [...first.screens, ...added], textHighlights: { ...first.textHighlights, ...extra?.highlights } };
      })()
    : first;
  const screenTotalAll = first?.screenTotal ?? 0;
  const hasMoreScreens = Boolean(raw && raw.screens.length < screenTotalAll);
  const loadMoreScreens = async () => {
    if (!raw || loadingMore || !hasMoreScreens) return;
    setLoadingMore(true);
    try {
      const next = await inspirationsApi.search(query, textSearch ? 'text' : undefined, undefined, { offset: raw.screens.length, limit: 50 }, serverFilters);
      setPages((cur) => {
        const base = cur.key === searchKey ? cur : { key: searchKey, screens: [], highlights: {} };
        return { key: searchKey, screens: [...base.screens, ...next.screens], highlights: { ...base.highlights, ...next.textHighlights } };
      });
    } finally {
      setLoadingMore(false);
    }
  };

  // The "Search text in screenshot" box only narrows this page's screens: it matches its own text against the
  // screenshots and keeps the result screens that contain it. The main query (q) is untouched.
  const { data: textHits, loading: textLoading } = useAsync(
    () => (textQuery ? inspirationsApi.search(textQuery, 'text', undefined, { limit: 200 }) : Promise.resolve(null)),
    `search-text:${textQuery}`,
  );
  // Only once the text matches are in — until then the results stay as they are, rather than dropping to 0.
  const textIds = textQuery && textHits ? new Set(textHits.screens.map((s) => s.id)) : null;
  const data = raw && textIds ? { ...raw, screens: raw.screens.filter((s) => textIds.has(s.id)), textHighlights: textHits?.textHighlights } : raw;

  // Every app in the results (before the app filter, so ticked apps stay in the list), for the app picker.
  const { data: appPool } = useAsync(
    () => inspirationsApi.search(query, undefined, undefined, { limit: 200 }, { ...serverFilters, app: '' }),
    `search-apps:${query}:${JSON.stringify({ ...serverFilters, app: '' })}`,
  );
  const resultApps = (() => {
    const pool = appPool ?? raw;
    if (!pool) return [];
    const ids = new Set<string>([...pool.apps.map((a) => a.id), ...pool.screens.map((s) => s.appId), ...pool.flows.map((f) => f.appId)]);
    return Array.from(ids)
      .map((id) => apps.get(id) ?? pool.apps.find((a) => a.id === id))
      .filter((a): a is App => Boolean(a));
  })();

  // UI Elements: the result screens that have recorded components.
  const componentScreens = (data?.screens ?? []).filter((s) => s.elements.length > 0);

  // Flow results show as rows of their screens (same as the Flows page), so their screens are fetched in one go.
  const shownFlows = data?.flows ?? [];
  const { screens: flowScreens } = useScreensByIds(shownFlows.flatMap((f) => f.screenIds));

  // Pattern results show the screens those patterns were found on, narrowed by the pattern-category pill and by
  // the same filters as every other screen result (patterns themselves aren't tied to one app or platform).
  const patternFilter = (params.get('pattern') ?? '').split(',').filter(Boolean);
  const pickedPatterns = (data?.patterns ?? []).filter((p) => !patternFilter.length || patternFilter.includes(p.category));
  const patternScreenIds = Array.from(new Set(pickedPatterns.flatMap((p) => p.screenIds)));
  const patternCategoryCounts = (() => {
    const counts = new Map<string, Set<string>>();
    for (const p of data?.patterns ?? []) {
      const ids = counts.get(p.category) ?? new Set<string>();
      p.screenIds.forEach((id) => ids.add(id));
      counts.set(p.category, ids);
    }
    return Array.from(counts.entries())
      .map(([category, ids]) => ({ value: category, label: category, count: ids.size }))
      .sort((a, b) => b.count - a.count);
  })();
  const { screens: patternScreenMap, loading: patternScreensLoading } = useScreensByIds(patternScreenIds);
  const patternScreens = patternScreenIds
    .map((id) => patternScreenMap.get(id))
    .filter((s): s is Screen => Boolean(s))
    .filter((s) => matchesFilters(s, filters))
    .filter((s) => !elementFilter.length || s.elements.some((k) => elementFilter.includes(k)))
    .filter((s) => !appFilter.length || appFilter.includes(s.appId))
    .filter((s) => !textIds || textIds.has(s.id));

  // Each pill lists the values the results actually hold, with how many screens picking one would show (the
  // server counts each dimension with the other filters applied), most first. A new screen type appears here as
  // soon as a screen carries it. Values already picked stay listed even at 0, so they can be unticked. Without
  // counts (screenshot-text mode) the library's whole vocabulary is offered instead.
  const facetOptions = (
    facet: Record<string, number> | undefined,
    vocabulary: string[],
    picked: string[],
    label: (value: string) => string,
  ) => {
    if (!facet) return vocabulary.map((v) => ({ value: v, label: label(v) }));
    const values = Array.from(new Set([...Object.keys(facet), ...picked]));
    return values
      .map((v) => ({ value: v, label: label(v), count: facet[v] ?? 0 }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  };
  const facets = first?.facets;
  const industryOptions = facetOptions(facets?.industries, meta.taxonomy.industries, filters.industries, (v) => INDUSTRY_LABEL[v as Industry] ?? v);
  const typeOptions = facetOptions(facets?.screenTypes, meta.taxonomy.screenTypes, filters.screenTypes, screenTypeLabel);
  const stateOptions = facetOptions(facets?.states, meta.taxonomy.states, filters.states, screenStateLabel);
  const elementOptions = facetOptions(facets?.elements, meta.taxonomy.elements, elementFilter, elementLabel);
  const styleOptions = facetOptions(facets?.styles, meta.taxonomy.styles, filters.styles, styleLabel);

  const countFor = (k: ResultKind) => {
    if (!data) return undefined;
    if (k === 'apps') return data.apps.length;
    if (k === 'screens') return textIds ? data.screens.length : screenTotalAll;
    if (k === 'ui-elements') return componentScreens.length;
    if (k === 'flows') return data.flows.length;
    return patternScreens.length;
  };

  // With no type in the URL, open on the first type (in menu order) that has results.
  // A search that names a kind of screen (a type, state or style) is after screens, so it opens there.
  const asksForScreens = filters.screenTypes.length + filters.states.length + filters.styles.length > 0;
  const kind: ResultKind =
    pickedKind ??
    (data
      ? asksForScreens && countFor('screens')
        ? 'screens'
        : (KINDS.find(({ id }) => countFor(id))?.id ?? 'screens')
      : 'screens');

  // ── URL writes ───────────────────────────────────────────────────────────
  // Changing a filter keeps the type on view, even when it was only the default, so the page doesn't jump to
  // another type as counts change.
  const replaceParams = (edit: (sp: URLSearchParams) => void) => {
    const sp = new URLSearchParams(params.toString());
    if (!sp.get('view')) sp.set('view', kind);
    edit(sp);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  const setParam = (key: string, value?: string) => replaceParams((sp) => (value ? sp.set(key, value) : sp.delete(key)));
  const updateFilters = (patch: Partial<ScreenFilters>) => {
    // The platform switch owns its own param (and the iOS default stays implicit), so it is carried over as is.
    const platform = params.get('platform');
    const next = serializeFilters({ ...filters, ...patch, platforms: [], query }, new URLSearchParams(params.toString()));
    if (platform) next.set('platform', platform);
    if (!next.get('view')) next.set('view', kind);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const setKind = (k: ResultKind) =>
    replaceParams((sp) => {
      sp.set('view', k);
      if (sp.get('type') && KINDS.some((x) => x.id === sp.get('type'))) sp.delete('type');
    });

  useEffect(() => {
    if (literal || textSearch || !first?.intent) return;
    const { screenTypes, industries, styles, platforms } = first.intent;
    const states = first.intent.states ?? [];
    const sp = new URLSearchParams(params.toString());
    const take = (key: string, values: string[]) => {
      if (!values.length || sp.get(key)) return;
      sp.set(key, values.join(','));
    };
    take('type', screenTypes);
    take('industry', industries.filter((v) => (meta.taxonomy.industries as string[]).includes(v)));
    take('style', styles);
    // A word that is a screen type and a state too ("modal") is the type:
    // asking for both at once would leave only the few screens that are both.
    take('state', states.filter((state) => !screenTypes.includes(state as never)));
    if (platforms.length === 1 && !sp.get('platform') && platforms[0] !== 'ios') sp.set('platform', platforms[0]);
    sp.set('literal', '1');
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }, [first, literal, textSearch, params, pathname, router, meta.taxonomy.industries]);

  // Screenshot-text box (ScreenshotTextSearch): prefilled with the query; it writes ?text=, closing drops it.
  const closeText = () => setParam('text', undefined);

  if (!query) {
    // Starting points come from what the store holds, so nothing here promises content that is not in the library.
    const starters = [
      ...meta.taxonomy.screenTypes.slice(0, 4).map((t) => screenTypeLabel(t)),
      ...meta.taxonomy.industries.slice(0, 4).map((i) => INDUSTRY_LABEL[i as Industry] ?? i),
    ];
    return (
      <>
        <PageHeading title="Search" />
        {starters.length > 0 ? (
          <div className="ins-trending">
            {starters.map((s) => (
              <a key={s} href={INSPIRATIONS_ROUTES.searchFor(s)} className="ins-chip">
                <SearchIcon size={12} /> {s}
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title="The library is empty" description="There is nothing to search yet." />
        )}
      </>
    );
  }

  // The app and screenshot-text filters have no pill state of their own in the toolbar's left group, so they
  // are named in a line under it; the dimension pills show their own values.
  type Chip = { key: string; label: string; onRemove: () => void };
  const chips: Chip[] = [];
  if (appFilter.length) {
    const names = appFilter.map((id) => resultApps.find((a) => a.id === id)?.name ?? id);
    chips.push({ key: 'app', label: names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', '), onRemove: () => setParam('app', undefined) });
  }
  if (textQuery && SCREEN_KINDS.includes(kind)) chips.push({ key: 'text', label: `Text “${textQuery}”`, onRemove: closeText });

  const anyFilter =
    chips.length > 0 ||
    filters.screenTypes.length + filters.states.length + filters.industries.length + filters.styles.length + elementFilter.length + patternFilter.length > 0;
  // Whether a filter that applies to the type on view is narrowing it: screen filters don't touch apps or flows,
  // so an empty Apps list with only "Login" on isn't "nothing matches these filters".
  const kindFiltered =
    kind === 'apps' ? filters.industries.length + appFilter.length > 0 : kind === 'flows' ? appFilter.length > 0 : anyFilter;
  const clearFilters = () => {
    replaceParams((sp) => ['app', 'text', 'element', 'pattern', 'type', 'state', 'industry', 'style'].forEach((k) => sp.delete(k)));
  };
  const filteredEmpty = (
    <EmptyState play title="Nothing matches these filters" description="Try removing a filter to see more results." action={{ label: 'Clear filters', onClick: clearFilters }} />
  );

  const screenFiltersOn = SCREEN_KINDS.includes(kind);
  const unit = kind === 'apps' ? 'app' : kind === 'flows' ? 'flow' : 'screen';
  const shownTotal = data ? (countFor(kind) ?? null) : null;

  // The screen filters live in one "Filters" panel; each section only appears where it means something.
  const filterSections: FilterSection[] = [
    ...(kind === 'apps' || screenFiltersOn
      ? [{ key: 'industry', label: 'Categories', options: industryOptions, selected: filters.industries as string[], onToggle: (v: string) => updateFilters({ industries: toggleValue(filters.industries, v as Industry) }), onClear: () => updateFilters({ industries: [] }) }]
      : []),
    ...(screenFiltersOn
      ? [
          { key: 'type', label: 'Screen type', options: typeOptions, selected: filters.screenTypes as string[], onToggle: (v: string) => updateFilters({ screenTypes: toggleValue(filters.screenTypes, v as ScreenType) }), onClear: () => updateFilters({ screenTypes: [] }) },
          { key: 'state', label: 'State', options: stateOptions, selected: filters.states as string[], onToggle: (v: string) => updateFilters({ states: toggleValue(filters.states, v as ScreenState) }), onClear: () => updateFilters({ states: [] }) },
          { key: 'element', label: 'Element', options: elementOptions, selected: elementFilter, onToggle: (v: string) => setParam('element', toggleValue(elementFilter, v).join(',') || undefined), onClear: () => setParam('element', undefined) },
          { key: 'style', label: 'Style', options: styleOptions, selected: filters.styles as string[], onToggle: (v: string) => updateFilters({ styles: toggleValue(filters.styles, v as Style) }), onClear: () => updateFilters({ styles: [] }) },
        ]
      : []),
  ].filter((section) => section.options.length > 0 || section.selected.length > 0);
  const clearDimensionFilters = () => replaceParams((sp) => ['type', 'state', 'industry', 'style', 'element'].forEach((k) => sp.delete(k)));

  const textControl = <ScreenshotTextSearch applied={textQuery} prefill={query} onApply={(text) => setParam('text', text)} />;

  return (
    <>
      <PageHeading
        title={
          <>
            Results for <span className="ins-title-query">“{query}”</span>
          </>
        }
      />

      <ToolbarRow
        total={null}
        unit={unit}
        right={
          <>
            {screenFiltersOn && textControl}
            {screenFiltersOn && <span className="ins-ftoolbar-divider" aria-hidden="true" />}
            <AppTreePill apps={resultApps} selected={appFilter} onApply={(ids) => setParam('app', ids.length ? ids.join(',') : undefined)} />
          </>
        }
      >
        <KindPill kind={kind} counts={KINDS.map((k) => ({ ...k, count: countFor(k.id) }))} onPick={setKind} />
        {filterSections.length > 0 && <FiltersPill sections={filterSections} onClearAll={clearDimensionFilters} total={shownTotal} unit={unit} openSignal={openFilters} />}
        <AppliedFilterPills sections={filterSections} max={APPLIED_PILLS_MAX} onMore={() => setOpenFilters((n) => n + 1)} />
        {kind === 'patterns' && patternCategoryCounts.length > 0 && (
          <CheckboxFilterPill
            label="Patterns"
            options={patternCategoryCounts}
            selected={patternFilter}
            onToggle={(v) => setParam('pattern', toggleValue(patternFilter, v).join(',') || undefined)}
            onClear={() => setParam('pattern', undefined)}
          />
        )}
      </ToolbarRow>

      {chips.length > 0 && data && (
        <div className="ins-filtersum" aria-live="polite">
          {chips.map((chip) => (
            <span key={chip.key} className="ins-filtersum-chip">
              {chip.label}
              <button type="button" aria-label={`Remove ${chip.label}`} onClick={chip.onRemove}>
                <CloseIcon size={10} strokeWidth={3} />
              </button>
            </span>
          ))}
          <button type="button" className="ins-filtersum-clear" onClick={clearFilters}>
            Clear all
          </button>
        </div>
      )}

      {loading || (textQuery && (textLoading || !textHits)) || !data ? (
        // Screen results load in the frameless app-page cards with no app line, so their skeleton matches that.
        <div className={kind === 'apps' || kind === 'flows' ? '' : 'ins-shot-panel'}>
          <ScreenGridSkeleton count={kind === 'apps' ? 4 : 10} meta={kind === 'apps'} web={webGrid} />
        </div>
      ) : (first?.total ?? 0) === 0 && !anyFilter ? (
        <SearchEmpty query={query} platform={filters.platforms[0] ?? 'ios'} />
      ) : (
        <div className="ins-results">
          {kind === 'apps' && data.apps.length > 0 && (
            <section className="ins-result-section">
              {/* Same cards as the Apps page: each app's own screens, with the hover carousel and selection. */}
              <AppsGrid apps={data.apps} webLayout={data.apps.every((app) => app.platforms.every(isDesktopPlatform))} platforms={filters.platforms} />
            </section>
          )}

          {kind === 'screens' && data.screens.length > 0 && (
            <section className="ins-result-section ins-shot-panel">
              <ScreenGrid screens={data.screens} webGrid={webGrid} showMeta={false} selectable textHighlights={textSearch || textQuery ? data.textHighlights : undefined} />
              {hasMoreScreens && <LoadMore loading={loadingMore} shown={raw?.screens.length ?? 0} total={screenTotalAll} onMore={loadMoreScreens} />}
            </section>
          )}

          {kind === 'ui-elements' && componentScreens.length > 0 && (
            <section className="ins-result-section ins-shot-panel">
              <ScreenGrid
                screens={componentScreens}
                webGrid={webGrid}
                showMeta={false}
                selectable
                saveItem={(s) => ({ type: 'component', id: screenItemId(s.id, s.elements.find((e) => elementFilter.includes(e)) ?? s.elements[0] ?? '') })}
                textHighlights={textSearch || textQuery ? data.textHighlights : undefined}
              />
              {hasMoreScreens && <LoadMore loading={loadingMore} shown={raw?.screens.length ?? 0} total={screenTotalAll} onMore={loadMoreScreens} />}
            </section>
          )}

          {kind === 'flows' && data.flows.length > 0 && (
            <section className="ins-result-section">
              <FlowList
                entries={shownFlows.map((flow) => ({
                  flow,
                  screens: flow.screenIds.map((id) => flowScreens.get(id)).filter((s): s is Screen => Boolean(s)),
                }))}
                apps={apps}
              />
            </section>
          )}

          {kind === 'patterns' && data.patterns.length > 0 && (
            <section className="ins-result-section ins-shot-panel">
              {patternScreensLoading ? (
                <ScreenGridSkeleton count={Math.min(patternScreenIds.length, 10) || 5} meta={false} web={webGrid} />
              ) : (
                <ScreenGrid
                  screens={patternScreens}
                  webGrid={webGrid}
                  showMeta={false}
                  selectable
                  saveItem={(s) => ({ type: 'pattern', id: screenItemId(s.id, pickedPatterns.find((p) => p.screenIds.includes(s.id))?.category ?? '') })}
                  textHighlights={textQuery ? data.textHighlights : undefined}
                  empty={anyFilter ? filteredEmpty : <EmptyState play title="No pattern screens matched" />}
                />
              )}
            </section>
          )}

          {countFor(kind) === 0 &&
            !(kind === 'patterns' && data.patterns.length > 0) &&
            (kindFiltered ? filteredEmpty : <EmptyState play title={`No ${KINDS.find((x) => x.id === kind)?.label.toLowerCase()} matched “${query}”`} />)}
        </div>
      )}
    </>
  );
}

/**
 * The result-type pill at the toolbar's left: shows the type on view and opens a menu of every type with its
 * count — the search page's stand-in for Explore's content-type switcher.
 */
function KindPill({
  kind,
  counts,
  onPick,
}: {
  kind: ResultKind;
  counts: { id: ResultKind; label: string; count: number | undefined }[];
  onPick: (kind: ResultKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(open, () => setOpen(false), ref);
  useAutoFocusMenu(open, ref);
  const active = counts.find((c) => c.id === kind);
  return (
    <div className="ins-popwrap" ref={ref}>
      <button
        type="button"
        className="ins-fpill"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Result type"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => onTriggerKeyDown(e, open, setOpen)}
      >
        {active?.label ?? 'Screens'}
        {/* How many results the type on view holds, right on the pill that picks it. */}
        {active?.count !== undefined && <span className="ins-fpill-count">{formatCount(active.count)}</span>}
        <span className="ins-fpill-chev" aria-hidden />
      </button>
      {open && (
        <div className="ins-popover ins-fmenu" role="menu" aria-label="Result type" onKeyDown={onMenuKeyDown}>
          {counts.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              aria-current={item.id === kind ? 'page' : undefined}
              className={`ins-fmenu-item ${item.id === kind ? 'is-selected' : ''}`}
              onClick={() => {
                setOpen(false);
                if (item.id !== kind) onPick(item.id);
              }}
            >
              {item.label}
              {item.count !== undefined && <span className="ins-fmenu-count">{formatCount(item.count)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Load more" under a screen grid: loads the next page on click, and on its own when it scrolls into view so
 * the grid keeps going as you scroll.
 */
function LoadMore({ loading, shown, total, onMore }: { loading: boolean; shown: number; total: number; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    onMoreRef.current = onMore;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onMoreRef.current(), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className="ins-loadmore">
      <span className="ins-loadmore-count">
        Showing {shown.toLocaleString()} of {total.toLocaleString()} screens
      </span>
      <button type="button" className="ins-loadmore-btn" onClick={onMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}
