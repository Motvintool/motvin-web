'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms } from '@/lib/inspirations/filters';
import { screenItemId } from '@/lib/inspirations/savedItems';
import type { Screen } from '@/lib/inspirations/types';
import { EmptyState } from '../EmptyState';
import { NavPill, ToolbarRow } from '../FilterToolbar';
import { GridIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { ScreenGrid } from '../ScreenGrid';
import { ScreenshotTextSearch } from '../ScreenshotTextSearch';
import { ScreenGridSkeleton } from '../Skeletons';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';
import { CheckboxFilterPill } from './AppDetailView';

/** Screens shown at first; scrolling to the end shows the next batch. */
const PAGE = 60;

/**
 * /inspirations/patterns — the pattern library, shown the way search shows pattern results: the screens the
 * patterns were found on, in the frameless app-page grid, with a Patterns pill to narrow by category
 * (?category=Forms,Modals). Follows the platform switch like every other browse page.
 *
 * A pattern only appears once real screens match it, so this page grows as the store does.
 */
export function PatternsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const meta = useMeta();
  const platforms = browsedPlatforms(params);
  const picked = (params.get('category') ?? '').split(',').filter(Boolean);
  const [shown, setShown] = useState(PAGE);

  // Every pattern with the screens it was found on (one request per pattern).
  const { data, loading } = useAsync(async () => {
    const patterns = await inspirationsApi.listPatterns();
    const full = await Promise.all(patterns.map((p) => inspirationsApi.getPattern(p.slug)));
    return patterns.map((pattern, i) => ({ pattern, screens: full[i]?.screens ?? [] }));
  }, 'patterns-with-screens');

  // Screens on the platform being browsed, per pattern.
  const entries = (data ?? []).map(({ pattern, screens }) => ({
    pattern,
    screens: screens.filter((s) => platforms.includes(s.platform)),
  }));

  // The category pill: each category with how many distinct screens it holds on this platform.
  const categoryOptions = (() => {
    const byCategory = new Map<string, Set<string>>();
    for (const { pattern, screens } of entries) {
      const ids = byCategory.get(pattern.category) ?? new Set<string>();
      screens.forEach((s) => ids.add(s.id));
      byCategory.set(pattern.category, ids);
    }
    return Array.from(byCategory.entries())
      .filter(([, ids]) => ids.size > 0)
      .map(([category, ids]) => ({ value: category, label: category, count: ids.size }))
      .sort((a, b) => b.count - a.count);
  })();

  // The grid: every screen of the picked categories (all of them when none is picked), each once.
  const screens = (() => {
    const seen = new Set<string>();
    const out: Screen[] = [];
    for (const { pattern, screens: list } of entries) {
      if (picked.length && !picked.includes(pattern.category)) continue;
      for (const s of list) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        out.push(s);
      }
    }
    return out;
  })();

  // Each screen's pattern category (the first picked one it's in), so a
  // selection saves as patterns.
  const categoryOf = (() => {
    const map = new Map<string, string>();
    for (const { pattern, screens: list } of entries) {
      if (picked.length && !picked.includes(pattern.category)) continue;
      for (const s of list) if (!map.has(s.id)) map.set(s.id, pattern.category);
    }
    return map;
  })();

  // "Search text in screenshot": keeps the pattern screens whose text matches, with the words highlighted.
  const textQuery = params.get('text')?.trim() ?? '';
  const { data: textHits, loading: textLoading } = useAsync(
    () => (textQuery ? inspirationsApi.search(textQuery, 'text', undefined, { limit: 200 }) : Promise.resolve(null)),
    `patterns-text:${textQuery}`,
  );
  const textIds = textQuery && textHits ? new Set(textHits.screens.map((s) => s.id)) : null;
  const gridScreens = textIds ? screens.filter((s) => textIds.has(s.id)) : screens;
  const setText = (text: string | undefined) => {
    setShown(PAGE);
    const sp = new URLSearchParams(params.toString());
    if (text) sp.set('text', text);
    else sp.delete('text');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setCategories = (next: string[]) => {
    setShown(PAGE);
    const sp = new URLSearchParams(params.toString());
    if (next.length) sp.set('category', next.join(','));
    else sp.delete('category');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeading title="Patterns" />

      <ToolbarRow total={null} unit="screen" right={<ScreenshotTextSearch applied={textQuery} onApply={setText} />}>
        <NavPill counts={meta.counts} activeCount={loading || (textQuery && !textHits) ? null : gridScreens.length} />
        {categoryOptions.length > 0 && (
          <CheckboxFilterPill
            label="Patterns"
            options={categoryOptions}
            selected={picked}
            onToggle={(v) => setCategories(picked.includes(v) ? picked.filter((c) => c !== v) : [...picked, v])}
            onClear={() => setCategories([])}
          />
        )}
      </ToolbarRow>

      <section className="ins-shot-panel">
        {loading || (textQuery && textLoading) ? (
          <ScreenGridSkeleton count={10} meta={false} />
        ) : (
          <ScreenGrid
            screens={gridScreens.slice(0, shown)}
            showMeta={false}
            selectable
            saveItem={(s) => ({ type: 'pattern', id: screenItemId(s.id, categoryOf.get(s.id) ?? '') })}
            textHighlights={textIds ? textHits?.textHighlights : undefined}
            hasMore={shown < gridScreens.length}
            onLoadMore={() => setShown((n) => n + PAGE)}
            empty={
              <EmptyState
                play={Boolean(textQuery || picked.length)}
                icon={<GridIcon size={22} />}
                title={
                  textQuery
                    ? `No pattern screens contain “${textQuery}”`
                    : picked.length
                      ? 'No pattern screens in these categories yet'
                      : 'No patterns matched yet'
                }
                description={
                  textQuery || picked.length
                    ? undefined
                    : 'Patterns are matched against stored screens when the manifest is built. Add screens and they fill in on their own.'
                }
                action={
                  textQuery
                    ? { label: 'Clear text search', onClick: () => setText(undefined) }
                    : picked.length
                      ? { label: 'Show all patterns', onClick: () => setCategories([]) }
                      : undefined
                }
              />
            }
          />
        )}
      </section>
    </>
  );
}
