'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import type { Industry } from '@/lib/inspirations/types';
import { AppsGrid } from '../AppsGrid';
import { ContentTabs } from '../ContentTabs';
import { PageHeading } from '../PageHeading';
import { useAsync } from '../useAsync';
import { useExploreFilters } from '../useExploreFilters';
import { useMeta } from '../useMeta';

type AppSort = 'newest' | 'az';

/** /inspirations/apps — every app that has screens in the store. */
export function AppsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { update } = useExploreFilters();
  const meta = useMeta();

  const industries = meta.taxonomy.industries as Industry[];
  const raw = params.get('industry');
  const industry = industries.includes(raw as Industry) ? (raw as Industry) : undefined;

  // Sort lives in its own query param rather than on ScreenFilters — the
  // same reasoning as the Explore sort tabs in FilteredGallery.tsx: no other
  // page that uses that type has a use for it.
  const rawSort = params.get('sort');
  const sort: AppSort | undefined = rawSort === 'newest' || rawSort === 'az' ? rawSort : undefined;
  const setSort = (next?: AppSort) => {
    const sp = new URLSearchParams(params.toString());
    if (next) sp.set('sort', next);
    else sp.delete('sort');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data: apps, loading } = useAsync(
    () => inspirationsApi.listApps(industry, sort),
    `apps:${industry ?? 'all'}:${sort ?? 'default'}`,
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

      <div className="ins-filterbar">
        <div className="ins-chips" role="group" aria-label="Sort">
          <button
            type="button"
            className={`ins-chip ${sort === 'newest' ? 'is-active' : ''}`}
            aria-pressed={sort === 'newest'}
            onClick={() => setSort(sort === 'newest' ? undefined : 'newest')}
          >
            Latest
          </button>
          <button
            type="button"
            className={`ins-chip ${sort === 'az' ? 'is-active' : ''}`}
            aria-pressed={sort === 'az'}
            onClick={() => setSort(sort === 'az' ? undefined : 'az')}
          >
            A–Z
          </button>
        </div>
      </div>

      <AppsGrid
        apps={apps ?? []}
        loading={loading}
        emptyTitle={industry ? 'No apps in this industry yet' : 'No apps in the library yet'}
        emptyDescription={
          industry
            ? undefined
            : 'Apps appear here once their screens are added to the store and approved for publishing.'
        }
        emptyAction={industry ? { label: 'Show all apps', onClick: () => update({ industries: [] }) } : undefined}
      />
    </>
  );
}
