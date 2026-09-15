'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { FLOW_CATEGORY_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, FlowCategory, Screen } from '@/lib/inspirations/types';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { FlowIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { CardRowSkeleton } from '../Skeletons';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

const CATEGORIES = Object.keys(FLOW_CATEGORY_LABEL) as FlowCategory[];

/** /inspirations/flows — stored multi-screen journeys. */
export function FlowsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();
  const apps = useApps();

  const raw = params.get('category');
  const category = CATEGORIES.includes(raw as FlowCategory) ? (raw as FlowCategory) : undefined;

  const { data: flows, loading } = useAsync(
    () => inspirationsApi.listFlows(category),
    `flows:${category ?? 'all'}`,
  );

  // Flow cards need their screens; one request per flow, cached by the client.
  const { data: resolved } = useAsync<{ flow: Flow; screens: Screen[] }[]>(async () => {
    if (!flows?.length) return [];
    const full = await Promise.all(flows.map((f) => inspirationsApi.getFlow(f.id)));
    return full
      .filter((entry): entry is { flow: Flow; screens: Screen[]; app: App | null } => Boolean(entry))
      .map(({ flow, screens }) => ({ flow, screens }));
  }, `flow-screens:${category ?? 'all'}:${flows?.length ?? 0}`);

  const present = new Set((flows ?? []).map((f) => f.category));
  const pick = (c?: FlowCategory) => router.replace(c ? `${pathname}?category=${c}` : pathname, { scroll: false });

  return (
    <>
      <PageHeading
        title="Flows"
        count={meta.counts.flows ? String(meta.counts.flows) : undefined}
        description="Screens connected into the journeys users actually take."
      />
      <ContentTabs counts={meta.counts} active="flows" />

      {(category || present.size > 1) && (
        <div className="ins-filterbar">
          <div className="ins-chips" role="group" aria-label="Flow category">
            <button type="button" className={`ins-chip ${!category ? 'is-active' : ''}`} aria-pressed={!category} onClick={() => pick()}>
              All
            </button>
            {CATEGORIES.filter((c) => present.has(c) || c === category).map((c) => (
              <button
                key={c}
                type="button"
                className={`ins-chip ${category === c ? 'is-active' : ''}`}
                aria-pressed={category === c}
                onClick={() => pick(category === c ? undefined : c)}
              >
                {FLOW_CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <CardRowSkeleton count={6} />
      ) : !flows || flows.length === 0 ? (
        <EmptyState
          icon={<FlowIcon size={22} />}
          title={category ? 'No flows in this category yet' : 'No flows in the library yet'}
          description={
            category
              ? undefined
              : 'A flow is a list of stored screens in order, defined in flows.json in the backend store.'
          }
          action={category ? { label: 'Show all flows', onClick: () => pick() } : undefined}
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
