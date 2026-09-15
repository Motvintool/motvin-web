'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { ELEMENT_LABEL, formatCount } from '@/lib/inspirations/taxonomy';
import { ELEMENT_KINDS, type ElementKind, type Screen } from '@/lib/inspirations/types';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { PageHeading } from '../PageHeading';
import { ScreenGrid } from '../ScreenGrid';
import { useAsync } from '../useAsync';

/**
 * /inspirations/ui-elements — screens grouped by the component they contain.
 * Pick an element kind; see every screen where the extractor found one.
 */
export function UiElementsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('kind');
  const kind: ElementKind = ELEMENT_KINDS.includes(raw as ElementKind) ? (raw as ElementKind) : 'button';

  const { data: counts } = useAsync(() => inspirationsApi.getCounts(), 'counts');
  const { data: kinds, loading } = useAsync(() => inspirationsApi.listElementKinds(), 'element-kinds');

  const current = kinds?.find((k) => k.kind === kind);
  const screens = (current?.screenIds ?? []).map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s));

  return (
    <>
      <PageHeading title="UI Elements" count={counts ? formatCount(counts['ui-elements']) : undefined} description="Components detected across the library. Select one to study it in context." />
      <ContentTabs counts={counts} active="ui-elements" />
      <div className="ins-filterbar">
        <div className="ins-chips" role="group" aria-label="Element">
          {(kinds ?? ELEMENT_KINDS.map((k) => ({ kind: k, count: 0, screenIds: [] as string[] }))).map((k) => (
            <button
              key={k.kind}
              type="button"
              className={`ins-chip ${kind === k.kind ? 'is-active' : ''}`}
              aria-pressed={kind === k.kind}
              onClick={() => router.replace(`${pathname}?kind=${k.kind}`, { scroll: false })}
            >
              {ELEMENT_LABEL[k.kind]}
              {k.count > 0 && <span className="ins-chip-count">{k.count}</span>}
            </button>
          ))}
        </div>
      </div>
      <ScreenGrid
        screens={screens}
        loading={loading}
        empty={<EmptyState title={`No screens with a ${ELEMENT_LABEL[kind].toLowerCase()} yet`} />}
      />
    </>
  );
}
