'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { elementLabel } from '@/lib/inspirations/taxonomy';
import type { CollectionItem, Screen } from '@/lib/inspirations/types';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { BookmarkIcon, ChevronDownIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { ScreenGrid } from '../ScreenGrid';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useLibrary } from '../useLibrary';
import { useScreensByIds } from '../useScreensByIds';

type SavedTab = 'all' | 'screens' | 'flows' | 'patterns' | 'components';
type Sort = 'saved' | 'viewed';

const TABS: { id: SavedTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'screens', label: 'Screens' },
  { id: 'flows', label: 'Flows' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'components', label: 'Components' },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'saved', label: 'Recently saved' },
  { id: 'viewed', label: 'Recently viewed' },
];

/**
 * /inspirations/saved — what the visitor bookmarked, in the same gallery as
 * Explore. `?collection=` narrows to one board.
 */
export function SavedView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { saved, collections } = useLibrary();
  const apps = useApps();

  const rawTab = params.get('type');
  const tab: SavedTab = TABS.some((t) => t.id === rawTab) ? (rawTab as SavedTab) : 'all';
  const rawSort = params.get('sort');
  const sort: Sort = SORTS.some((s) => s.id === rawSort) ? (rawSort as Sort) : 'saved';
  const collectionId = params.get('collection');
  const collection = collections.find((c) => c.id === collectionId);

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const items: CollectionItem[] = useMemo(() => {
    const source = collection ? collection.items : saved;
    const list = [...source];
    if (sort === 'viewed') {
      const stamp = (i: CollectionItem): string => {
        const viewed = (i as { viewedAt?: string }).viewedAt;
        return viewed ?? i.addedAt;
      };
      list.sort((a, b) => stamp(b).localeCompare(stamp(a)));
    } else {
      list.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    }
    return list;
  }, [collection, saved, sort]);

  const screenIds = items.filter((i) => i.type === 'screen').map((i) => i.id);
  const { screens: screenMap } = useScreensByIds(screenIds);
  const screens = screenIds.map((id) => screenMap.get(id)).filter((s): s is Screen => Boolean(s));

  const flowIds = items.filter((i) => i.type === 'flow').map((i) => i.id);
  const { data: flows } = useAsync(
    async () => {
      const found = await Promise.all(flowIds.map((id) => inspirationsApi.getFlow(id)));
      return found.filter(Boolean).map((f) => f!);
    },
    `saved-flows:${flowIds.join(',')}`,
  );

  const patternIds = items.filter((i) => i.type === 'pattern').map((i) => i.id);
  const { data: allPatterns } = useAsync(() => inspirationsApi.listPatterns(), 'patterns');
  const patterns = (allPatterns ?? []).filter((p) => patternIds.includes(p.id));

  const components = items.filter((i) => i.type === 'component');
  const savedAppIds = items.filter((i) => i.type === 'app').map((i) => i.id);
  const savedApps = savedAppIds.map((id) => apps.get(id)).filter(Boolean);

  const count = (t: SavedTab) =>
    t === 'all'
      ? items.length
      : t === 'screens'
        ? screenIds.length
        : t === 'flows'
          ? flowIds.length
          : t === 'patterns'
            ? patternIds.length
            : components.length;

  const total = items.length;

  return (
    <>
      <PageHeading
        title={collection ? collection.name : 'Saved'}
        eyebrow={
          collection ? (
            <Link href={INSPIRATIONS_ROUTES.collections} className="ins-link">
              Collections
            </Link>
          ) : undefined
        }
        count={total ? String(total) : undefined}
        actions={
          total > 0 ? (
            <label className="ins-select-wrap">
              <span className="ins-select-label">Sort</span>
              <select
                className="ins-select"
                value={sort}
                onChange={(e) => setParam('sort', e.target.value === 'saved' ? null : e.target.value)}
                aria-label="Sort saved items"
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={14} className="ins-select-icon" />
            </label>
          ) : undefined
        }
      />

      <div className="ins-tabbar" role="tablist" aria-label="Saved type">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setParam('type', t.id === 'all' ? null : t.id)}
          >
            {t.label}
            {count(t.id) > 0 && <span className="ins-tab-count">{count(t.id)}</span>}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<BookmarkIcon size={22} />}
          title={collection ? 'This collection is empty' : 'Nothing saved yet'}
          description="Hover any screen and press Save, or add it to a collection."
          action={{ label: 'Explore screens', href: INSPIRATIONS_ROUTES.explore }}
        />
      ) : (
        <div className="ins-results">
          {(tab === 'all' || tab === 'screens') && screens.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && (
                <h2 className="ins-section-title">
                  Screens <span className="ins-title-count">{screens.length}</span>
                </h2>
              )}
              <ScreenGrid screens={screens} apps={apps} />
            </section>
          )}

          {(tab === 'all' || tab === 'flows') && (flows ?? []).length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && (
                <h2 className="ins-section-title">
                  Flows <span className="ins-title-count">{(flows ?? []).length}</span>
                </h2>
              )}
              <div className="ins-flow-grid">
                {(flows ?? []).map(({ flow, screens: flowScreens }) => (
                  <FlowCard key={flow.id} flow={flow} screens={flowScreens} app={apps.get(flow.appId)} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'patterns') && patterns.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && (
                <h2 className="ins-section-title">
                  Patterns <span className="ins-title-count">{patterns.length}</span>
                </h2>
              )}
              <div className="ins-pattern-grid-wrap">
                {patterns.map((p) => (
                  <PatternCard key={p.id} pattern={p} />
                ))}
              </div>
            </section>
          )}

          {(tab === 'all' || tab === 'components') && components.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && (
                <h2 className="ins-section-title">
                  Components <span className="ins-title-count">{components.length}</span>
                </h2>
              )}
              <div className="ins-element-list">
                {components.map((c) => {
                  const [screenId, kind] = c.id.split(':');
                  const screen = screenMap.get(screenId);
                  return (
                    <Link
                      key={c.id}
                      href={
                        screen
                          ? `${INSPIRATIONS_ROUTES.screen(screen)}?tab=extract`
                          : `${INSPIRATIONS_ROUTES.uiElements}?kind=${kind}`
                      }
                      className="ins-element-row"
                    >
                      <span className="ins-element-name">{elementLabel(kind)}</span>
                      <span className="ins-element-count">{screen ? screen.name : ''}</span>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {tab === 'all' && savedApps.length > 0 && (
            <section className="ins-result-section">
              <h2 className="ins-section-title">
                Apps <span className="ins-title-count">{savedApps.length}</span>
              </h2>
              <div className="ins-element-list">
                {savedApps.map(
                  (a) =>
                    a && (
                      <Link key={a.id} href={INSPIRATIONS_ROUTES.app(a)} className="ins-element-row">
                        <span className="ins-element-name">{a.name}</span>
                        <span className="ins-element-count">{a.screenCount} screens</span>
                      </Link>
                    ),
                )}
              </div>
            </section>
          )}

          {tab !== 'all' && count(tab) === 0 && (
            <EmptyState title={`No saved ${tab}`} action={{ label: 'Show everything', onClick: () => setParam('type', null) }} />
          )}
        </div>
      )}
    </>
  );
}
