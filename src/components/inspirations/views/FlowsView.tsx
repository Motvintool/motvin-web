'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { flowCategoryLabel, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Platform, Screen } from '@/lib/inspirations/types';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
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
  const platform = (params.get('platform') as Platform | null) ?? undefined;

  const { data: flows, loading } = useAsync(
    () => inspirationsApi.listFlows(category),
    `flows:${category ?? 'all'}`,
  );

  const visible = (flows ?? []).filter((f) => !platform || f.platform === platform);

  // Flow cards need their screens; one request per flow, cached by the client.
  const { data: resolved } = useAsync<{ flow: Flow; screens: Screen[] }[]>(async () => {
    if (!visible.length) return [];
    const full = await Promise.all(visible.map((f) => inspirationsApi.getFlow(f.id)));
    return full
      .filter((entry): entry is { flow: Flow; screens: Screen[]; app: App | null } => Boolean(entry))
      .map(({ flow, screens }) => ({ flow, screens }));
  }, `flow-screens:${category ?? 'all'}:${platform ?? 'all'}:${visible.map((f) => f.id).join(',')}`);

  const categories = meta.taxonomy.flowCategories ?? [];
  const platforms = Array.from(new Set((flows ?? []).map((f) => f.platform)));

  const setParam = (key: string, value?: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeading
        title="Flows"
        count={meta.counts.flows ? String(meta.counts.flows) : undefined}
        description="Screens connected into the journeys users actually take."
      />
      <ContentTabs counts={meta.counts} active="flows" />

      {(categories.length > 0 || platforms.length > 1) && (
        <div className="ins-filterbar">
          <div className="ins-chips" role="group" aria-label="Flow category">
            <button
              type="button"
              className={`ins-chip ${!category ? 'is-active' : ''}`}
              aria-pressed={!category}
              onClick={() => setParam('category')}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`ins-chip ${category === c ? 'is-active' : ''}`}
                aria-pressed={category === c}
                onClick={() => setParam('category', category === c ? undefined : c)}
              >
                {flowCategoryLabel(c)}
              </button>
            ))}
          </div>

          {platforms.length > 1 && (
            <div className="ins-filterbar-right">
              <div className="ins-chips" role="group" aria-label="Platform">
                {platforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`ins-chip ins-chip--sm ${platform === p ? 'is-active' : ''}`}
                    aria-pressed={platform === p}
                    onClick={() => setParam('platform', platform === p ? undefined : p)}
                  >
                    {PLATFORM_LABEL[p] ?? p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <CardRowSkeleton count={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FlowIcon size={22} />}
          title={category || platform ? 'No flows match this filter' : 'No flows in the library yet'}
          description={
            category || platform
              ? undefined
              : 'A flow is an ordered set of stored screens. Build one on the admin Flows tab.'
          }
          action={
            category || platform
              ? {
                  label: 'Show all flows',
                  onClick: () => {
                    setParam('category');
                    setParam('platform');
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="ins-flow-grid">
          {(resolved ?? []).map((entry) => (
            <FlowCard
              key={entry.flow.id}
              flow={entry.flow}
              screens={entry.screens}
              app={apps.get(entry.flow.appId)}
            />
          ))}
        </div>
      )}
    </>
  );
}
