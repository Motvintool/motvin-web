'use client';

import { useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import type { Industry } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { FolderIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { CardRowSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { useExploreFilters } from '../useExploreFilters';
import { useMeta } from '../useMeta';

/** /inspirations/apps — every app that has screens in the store. */
export function AppsView() {
  const params = useSearchParams();
  const { update } = useExploreFilters();
  const meta = useMeta();

  const industries = meta.taxonomy.industries as Industry[];
  const raw = params.get('industry');
  const industry = industries.includes(raw as Industry) ? (raw as Industry) : undefined;

  const { data: apps, loading } = useAsync(
    () => inspirationsApi.listApps(industry),
    `apps:${industry ?? 'all'}`,
  );

  return (
    <>
      <PageHeading title="Apps" count={meta.counts.apps ? String(meta.counts.apps) : undefined} />
      <ContentTabs counts={meta.counts} active="apps" />

      {industries.length > 0 && (
        <div className="ins-filterbar">
          <div className="ins-chips" role="group" aria-label="Industry">
            <button
              type="button"
              className={`ins-chip ${!industry ? 'is-active' : ''}`}
              aria-pressed={!industry}
              onClick={() => update({ industries: [] })}
            >
              All
            </button>
            {industries.map((i) => (
              <button
                key={i}
                type="button"
                className={`ins-chip ${industry === i ? 'is-active' : ''}`}
                aria-pressed={industry === i}
                onClick={() => update({ industries: industry === i ? [] : [i] })}
              >
                {INDUSTRY_LABEL[i] ?? i}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <CardRowSkeleton count={8} />
      ) : !apps || apps.length === 0 ? (
        <EmptyState
          icon={<FolderIcon size={22} />}
          title={industry ? 'No apps in this industry yet' : 'No apps in the library yet'}
          description={
            industry
              ? undefined
              : 'Apps appear here once their screens are added to the store and approved for publishing.'
          }
          action={industry ? { label: 'Show all apps', onClick: () => update({ industries: [] }) } : undefined}
        />
      ) : (
        <div className="ins-app-grid">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </>
  );
}
