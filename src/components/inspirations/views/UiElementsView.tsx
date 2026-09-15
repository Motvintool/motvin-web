'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { EMPTY_FILTERS } from '@/lib/inspirations/filters';
import { elementLabel, formatCount } from '@/lib/inspirations/taxonomy';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { LayersIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { ScreenGrid } from '../ScreenGrid';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

/**
 * /inspirations/ui-elements — screens grouped by the components recorded in
 * them. The kinds listed are the ones the store actually holds.
 */
export function UiElementsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();

  const { data: kinds, loading: kindsLoading } = useAsync(() => inspirationsApi.listElements(), 'element-kinds');

  const available = kinds ?? [];
  const raw = params.get('kind');
  const kind = available.some((k) => k.kind === raw) ? raw! : available[0]?.kind;

  const { data: page, loading } = useAsync(
    () =>
      kind
        ? inspirationsApi.listScreens(EMPTY_FILTERS, 0, 'curated', { element: kind })
        : Promise.resolve({ items: [], total: 0, limit: 30, offset: 0, nextOffset: null }),
    `elements:${kind ?? 'none'}`,
  );

  return (
    <>
      <PageHeading
        title="UI Elements"
        count={meta.counts['ui-elements'] ? formatCount(meta.counts['ui-elements']) : undefined}
        description="Components recorded across the library. Select one to study it in context."
      />
      <ContentTabs counts={meta.counts} active="ui-elements" />

      {available.length > 0 && (
        <div className="ins-filterbar">
          <div className="ins-chips" role="group" aria-label="Element">
            {available.map((k) => (
              <button
                key={k.kind}
                type="button"
                className={`ins-chip ${kind === k.kind ? 'is-active' : ''}`}
                aria-pressed={kind === k.kind}
                onClick={() => router.replace(`${pathname}?kind=${k.kind}`, { scroll: false })}
              >
                {elementLabel(k.kind)}
                <span className="ins-chip-count">{k.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!kindsLoading && available.length === 0 ? (
        <EmptyState
          icon={<LayersIcon size={22} />}
          title="No components recorded yet"
          description="Components come from each screen's sidecar file, or from an analyzer that has run over it."
        />
      ) : (
        <ScreenGrid
          screens={page?.items ?? []}
          loading={loading || kindsLoading}
          empty={<EmptyState title={`No screens with a ${kind ? elementLabel(kind).toLowerCase() : 'component'} yet`} />}
        />
      )}
    </>
  );
}
