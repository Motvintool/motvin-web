'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { SCREEN_BY_ID } from '@/lib/inspirations/data/build';
import { PATTERN_CATEGORIES } from '@/lib/inspirations/taxonomy';
import type { PatternCategory, Screen } from '@/lib/inspirations/types';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { CardRowSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';

/** /inspirations/patterns — the pattern library grouped by category. */
export function PatternsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get('category');
  const category = PATTERN_CATEGORIES.includes(raw as PatternCategory) ? (raw as PatternCategory) : undefined;

  const { data: counts } = useAsync(() => inspirationsApi.getCounts(), 'counts');
  const { data: patterns, loading } = useAsync(() => inspirationsApi.listPatterns(), 'patterns');

  const visible = (patterns ?? []).filter((p) => !category || p.category === category);
  const pick = (c?: PatternCategory) => router.replace(c ? `${pathname}?category=${encodeURIComponent(c)}` : pathname, { scroll: false });

  return (
    <>
      <PageHeading title="Patterns" count={counts ? String(counts.patterns) : undefined} description="Recurring UI solutions, shown as many real examples side by side." />
      <ContentTabs counts={counts} active="patterns" />
      <div className="ins-filterbar">
        <div className="ins-chips" role="group" aria-label="Pattern category">
          <button type="button" className={`ins-chip ${!category ? 'is-active' : ''}`} aria-pressed={!category} onClick={() => pick()}>All</button>
          {PATTERN_CATEGORIES.map((c) => (
            <button key={c} type="button" className={`ins-chip ${category === c ? 'is-active' : ''}`} aria-pressed={category === c} onClick={() => pick(category === c ? undefined : c)}>
              {c}
            </button>
          ))}
        </div>
      </div>
      {loading || !patterns ? (
        <CardRowSkeleton count={10} />
      ) : visible.length === 0 ? (
        <EmptyState title="No patterns in this category yet" action={{ label: 'Show all patterns', onClick: () => pick() }} />
      ) : (
        <div className="ins-pattern-grid-wrap">
          {visible.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              screens={pattern.screenIds.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s))}
            />
          ))}
        </div>
      )}
    </>
  );
}
