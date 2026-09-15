'use client';

import { useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { SCREENS } from '@/lib/inspirations/data/build';
import { INDUSTRY_LABEL, QUICK_INDUSTRIES } from '@/lib/inspirations/taxonomy';
import { INDUSTRIES, type Industry } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { PageHeading } from '../PageHeading';
import { CardRowSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { useExploreFilters } from '../useExploreFilters';

/** /inspirations/apps — every app as a collection of screens. */
export function AppsView() {
  const params = useSearchParams();
  const { update } = useExploreFilters();
  const raw = params.get('industry');
  const industry = INDUSTRIES.includes(raw as Industry) ? (raw as Industry) : undefined;

  const { data: counts } = useAsync(() => inspirationsApi.getCounts(), 'counts');
  const { data: apps, loading } = useAsync(() => inspirationsApi.listApps(industry), `apps:${industry ?? 'all'}`);

  return (
    <>
      <PageHeading title="Apps" count={counts ? String(counts.apps) : undefined} />
      <ContentTabs counts={counts} active="apps" />
      <div className="ins-filterbar">
        <div className="ins-chips" role="group" aria-label="Industry">
          <button type="button" className={`ins-chip ${!industry ? 'is-active' : ''}`} aria-pressed={!industry} onClick={() => update({ industries: [] })}>All</button>
          {QUICK_INDUSTRIES.map((i) => (
            <button key={i} type="button" className={`ins-chip ${industry === i ? 'is-active' : ''}`} aria-pressed={industry === i} onClick={() => update({ industries: industry === i ? [] : [i] })}>
              {INDUSTRY_LABEL[i]}
            </button>
          ))}
        </div>
      </div>
      {loading || !apps ? (
        <CardRowSkeleton count={12} />
      ) : apps.length === 0 ? (
        <EmptyState title="No apps in this industry yet" action={{ label: 'Show all apps', onClick: () => update({ industries: [] }) }} />
      ) : (
        <div className="ins-app-grid">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} preview={SCREENS.filter((s) => s.appId === app.id).slice(0, 3)} />
          ))}
        </div>
      )}
    </>
  );
}
