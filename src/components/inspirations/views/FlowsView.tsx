'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms } from '@/lib/inspirations/filters';
import { FLOW_KINDS } from '@/lib/inspirations/flowKinds';
import { flowCategoryLabel } from '@/lib/inspirations/taxonomy';
import { type App, type Flow, type Screen } from '@/lib/inspirations/types';
import { EmptyState } from '../EmptyState';
import { FilterPill, NavPill, ToolbarRow } from '../FilterToolbar';
import { FlowList } from '../FlowList';
import { FlowIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { FlowListSkeleton } from '../Skeletons';
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
  // One standard kind of flow across apps (Logging In — flowKinds.ts), from the search's Flows tab or its own
  // pill; any value outside the list is ignored.
  const rawKind = params.get('kind');
  const kind = FLOW_KINDS.find((k) => k === rawKind);
  // No param means the iOS default; Webs is websites and web apps together —
  // the same platforms every feed and the header nav use.
  const platforms = browsedPlatforms(params);
  const platform = platforms.join(',');

  const { data: flows, loading } = useAsync(
    () => inspirationsApi.listFlows(category),
    `flows:${category ?? 'all'}`,
  );

  // Real journeys only, as Mobbin lists them: a section heading with one screen of its own is not a flow.
  const visible = (flows ?? []).filter(
    (f) => platforms.includes(f.platform) && f.screenIds.length > 1 && (!kind || f.kind === kind),
  );

  // Flow cards need their screens; one request per flow, cached by the client.
  const { data: resolved } = useAsync<{ flow: Flow; screens: Screen[] }[]>(async () => {
    if (!visible.length) return [];
    const full = await Promise.all(visible.map((f) => inspirationsApi.getFlow(f.id)));
    return full
      .filter((entry): entry is { flow: Flow; screens: Screen[]; app: App | null } => Boolean(entry))
      .map(({ flow, screens }) => ({ flow, screens }));
  }, `flow-screens:${category ?? 'all'}:${platform}:${visible.map((f) => f.id).join(',')}`);

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
          label="Flow"
          options={FLOW_KINDS.map((k) => ({ value: k, label: k }))}
          selected={kind ? [kind] : []}
          onToggle={(v) => setParam('kind', v === kind ? undefined : v)}
          onClear={() => setParam('kind')}
          multi={false}
        />
      </ToolbarRow>

      {loading ? (
        <FlowListSkeleton />
      ) : visible.length === 0 ? (
        // "Filtered" means the visitor chose something beyond the defaults —
        // a category, or a platform explicitly in the URL. The iOS default
        // isn't a filter they can clear.
        <EmptyState
          play={Boolean(category || kind || params.get('platform'))}
          icon={<FlowIcon size={22} />}
          title={category || kind || params.get('platform') ? 'No flows match this filter' : 'No flows here yet'}
          description={
            category || params.get('platform')
              ? undefined
              : 'We add new flows regularly. Check back soon.'
          }
          action={
            category || kind || params.get('platform')
              ? {
                  label: 'Show all flows',
                  onClick: () => setParams({ category: undefined, kind: undefined, platform: undefined }),
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
