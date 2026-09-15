'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { APP_BY_ID, SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { FLOW_CATEGORY_LABEL } from '@/lib/inspirations/taxonomy';
import type { FlowCategory, Screen } from '@/lib/inspirations/types';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { PageHeading } from '../PageHeading';
import { CardRowSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';

const CATEGORIES = Object.keys(FLOW_CATEGORY_LABEL) as FlowCategory[];

/** /inspirations/flows — multi-screen journeys, filterable by category. */
export function FlowsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('category');
  const category = CATEGORIES.includes(raw as FlowCategory) ? (raw as FlowCategory) : undefined;

  const { data: counts } = useAsync(() => inspirationsApi.getCounts(), 'counts');
  const { data: flows, loading } = useAsync(() => inspirationsApi.listFlows(category), `flows:${category ?? 'all'}`);

  const pick = (c?: FlowCategory) => router.replace(c ? `${pathname}?category=${c}` : pathname, { scroll: false });

  return (
    <>
      <PageHeading title="Flows" count={counts ? String(counts.flows) : undefined} description="Screens connected into the journeys users actually take." />
      <ContentTabs counts={counts} active="flows" />
      <div className="ins-filterbar">
        <div className="ins-chips" role="group" aria-label="Flow category">
          <button type="button" className={`ins-chip ${!category ? 'is-active' : ''}`} aria-pressed={!category} onClick={() => pick()}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`ins-chip ${category === c ? 'is-active' : ''}`} aria-pressed={category === c} onClick={() => pick(category === c ? undefined : c)}>
              {FLOW_CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      {loading || !flows ? (
        <CardRowSkeleton count={9} />
      ) : flows.length === 0 ? (
        <EmptyState title="No flows in this category yet" action={{ label: 'Show all flows', onClick: () => pick() }} />
      ) : (
        <div className="ins-flow-grid">
          {flows.map((flow) => (
            <FlowCard
              key={flow.id}
              flow={flow}
              app={APP_BY_ID.get(flow.appId)}
              screens={flow.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))}
            />
          ))}
        </div>
      )}
    </>
  );
}
