'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { DEFAULT_PLATFORM } from '@/lib/inspirations/filters';
import { PLATFORM_LABEL, flowCategoryLabel } from '@/lib/inspirations/taxonomy';
import { PLATFORMS, type App, type Flow, type Platform, type Screen } from '@/lib/inspirations/types';
import { EmptyState } from '../EmptyState';
import { FilterPill, NavPill, ToolbarRow } from '../FilterToolbar';
import { FlowList } from '../FlowList';
import { FlowIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { CardRowSkeleton } from '../Skeletons';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

/**
 * /inspirations/flows — stored multi-screen journeys.
 *
 * Categories come from the flows themselves rather than a fixed list, because
 * they are free text: a library ends up with journeys no preset anticipated.
 * Platform is a second filter, since the same journey differs per platform.
 */
export function FlowsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();
  const apps = useApps();

  const category = params.get('category') ?? undefined;
  // No param means the iOS default — the same real default every feed and the
  // header nav use, so this page always agrees with both.
  const platform = (params.get('platform') as Platform | null) ?? DEFAULT_PLATFORM;

  const { data: flows, loading } = useAsync(
    () => inspirationsApi.listFlows(category),
    `flows:${category ?? 'all'}`,
  );

  const visible = (flows ?? []).filter((f) => f.platform === platform);

  // Flow cards need their screens; one request per flow, cached by the client.
  const { data: resolved } = useAsync<{ flow: Flow; screens: Screen[] }[]>(async () => {
    if (!visible.length) return [];
    const full = await Promise.all(visible.map((f) => inspirationsApi.getFlow(f.id)));
    return full
      .filter((entry): entry is { flow: Flow; screens: Screen[]; app: App | null } => Boolean(entry))
      .map(({ flow, screens }) => ({ flow, screens }));
  }, `flow-screens:${category ?? 'all'}:${platform ?? 'all'}:${visible.map((f) => f.id).join(',')}`);

  // One URL write per call: two sequential setParam calls would each start
  // from this render's (stale) params, so the second would resurrect the key
  // the first had just deleted.
  const setParams = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) sp.set(key, value);
      else sp.delete(key);
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const setParam = (key: string, value?: string) => setParams({ [key]: value });

  return (
    <>
      <PageHeading title="Flows" />
      {/* Same toolbar shape as the Screens page: one pill per dimension.
          Category is single-select because the flows API takes one category;
          Platform only appears once the library actually spans more than one. */}
      <ToolbarRow total={loading ? null : visible.length} unit="flow">
        <NavPill counts={meta.counts} />
        <FilterPill
          label="Category"
          options={meta.taxonomy.flowCategories.map((c) => ({ value: c, label: flowCategoryLabel(c) }))}
          selected={category ? [category] : []}
          onToggle={(v) => setParam('category', v === category ? undefined : v)}
          onClear={() => setParam('category')}
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

      {loading ? (
        <CardRowSkeleton count={6} />
      ) : visible.length === 0 ? (
        // "Filtered" means the visitor chose something beyond the defaults —
        // a category, or a platform explicitly in the URL. The iOS default
        // isn't a filter they can clear.
        <EmptyState
          icon={<FlowIcon size={22} />}
          title={category || params.get('platform') ? 'No flows match this filter' : 'No flows in the library yet'}
          description={
            category || params.get('platform')
              ? undefined
              : 'A flow is an ordered set of stored screens. Build one on the admin Flows tab.'
          }
          action={
            category || params.get('platform')
              ? {
                  label: 'Show all flows',
                  onClick: () => setParams({ category: undefined, platform: undefined }),
                }
              : undefined
          }
        />
      ) : (
        <FlowList entries={resolved ?? []} apps={apps} />
      )}
    </>
  );
}
