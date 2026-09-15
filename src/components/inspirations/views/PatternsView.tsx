'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { PATTERN_CATEGORIES } from '@/lib/inspirations/taxonomy';
import type { Pattern, PatternCategory, Screen } from '@/lib/inspirations/types';
import { ContentTabs } from '../ContentTabs';
import { EmptyState } from '../EmptyState';
import { GridIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { CardRowSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

/**
 * /inspirations/patterns — the pattern library.
 *
 * A pattern only appears once real screens match it, so this page grows as the
 * store does rather than listing empty categories.
 */
export function PatternsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();

  const raw = params.get('category');
  const category = PATTERN_CATEGORIES.includes(raw as PatternCategory) ? (raw as PatternCategory) : undefined;

  const { data: patterns, loading } = useAsync(() => inspirationsApi.listPatterns(), 'patterns');

  // Example thumbnails for each visible pattern.
  const visible = (patterns ?? []).filter((p) => !category || p.category === category);
  const { data: examples } = useAsync<Map<string, Screen[]>>(async () => {
    const entries = await Promise.all(
      visible.slice(0, 24).map(async (p) => {
        const full = await inspirationsApi.getPattern(p.slug);
        return [p.slug, full?.screens.slice(0, 4) ?? []] as const;
      }),
    );
    return new Map(entries);
  }, `pattern-examples:${category ?? 'all'}:${visible.length}`);

  const present = new Set((patterns ?? []).map((p) => p.category));
  const pick = (c?: PatternCategory) =>
    router.replace(c ? `${pathname}?category=${encodeURIComponent(c)}` : pathname, { scroll: false });

  return (
    <>
      <PageHeading
        title="Patterns"
        count={meta.counts.patterns ? String(meta.counts.patterns) : undefined}
        description="Recurring UI solutions, shown as real examples side by side."
      />
      <ContentTabs counts={meta.counts} active="patterns" />

      {present.size > 0 && (
        <div className="ins-filterbar">
          <div className="ins-chips" role="group" aria-label="Pattern category">
            <button type="button" className={`ins-chip ${!category ? 'is-active' : ''}`} aria-pressed={!category} onClick={() => pick()}>
              All
            </button>
            {PATTERN_CATEGORIES.filter((c) => present.has(c)).map((c) => (
              <button
                key={c}
                type="button"
                className={`ins-chip ${category === c ? 'is-active' : ''}`}
                aria-pressed={category === c}
                onClick={() => pick(category === c ? undefined : c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <CardRowSkeleton count={8} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<GridIcon size={22} />}
          title={category ? 'No patterns in this category yet' : 'No patterns matched yet'}
          description={
            category
              ? undefined
              : 'Patterns are matched against stored screens when the manifest is built. Add screens and they fill in on their own.'
          }
          action={category ? { label: 'Show all patterns', onClick: () => pick() } : undefined}
        />
      ) : (
        <div className="ins-pattern-grid-wrap">
          {visible.map((pattern: Pattern) => (
            <PatternCard key={pattern.id} pattern={pattern} screens={examples?.get(pattern.slug) ?? []} />
          ))}
        </div>
      )}
    </>
  );
}
