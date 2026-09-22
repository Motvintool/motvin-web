'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { elementLabel } from '@/lib/inspirations/taxonomy';
import type { App, CollectionItem, Screen } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { FloatCollectionBar } from '../FloatCollectionBar';
import { BookmarkIcon, ChevronDownIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { ScreenGrid } from '../ScreenGrid';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useLibrary } from '../useLibrary';
import { useAppSelection } from '../useAppSelection';
import { useScreensByIds } from '../useScreensByIds';

type SavedTab = 'all' | 'apps' | 'screens' | 'flows' | 'patterns' | 'components';
type Sort = 'saved' | 'viewed';

const TABS: { id: SavedTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'screens', label: 'Screens' },
  { id: 'flows', label: 'Flows' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'components', label: 'Components' },
];

const COLLECTION_TABS: { id: SavedTab; label: string }[] = [
  { id: 'apps', label: 'Apps' },
  { id: 'screens', label: 'Screens' },
  { id: 'components', label: 'UI Elements' },
  { id: 'flows', label: 'Flows' },
  { id: 'patterns', label: 'Patterns' },
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
  const { saved, collections, deleteCollection } = useLibrary();
  const apps = useApps();
  const { selected, toggle, clear } = useAppSelection();

  const collectionId = params.get('collection');
  const collection = collections.find((c) => c.id === collectionId);
  const tabs = collection ? COLLECTION_TABS : TABS;
  const rawTab = params.get('type');
  const tab: SavedTab = tabs.some((t) => t.id === rawTab) ? (rawTab as SavedTab) : collection ? 'apps' : 'all';
  const rawSort = params.get('sort');
  const sort: Sort = SORTS.some((s) => s.id === rawSort) ? (rawSort as Sort) : 'saved';

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
  const savedApps = savedAppIds.map((id) => apps.get(id)).filter((app): app is App => Boolean(app));
  const { data: appPreviews, loading: appPreviewsLoading } = useAsync(async () => {
    const details = await Promise.all(savedApps.map((app) => inspirationsApi.getApp(app.id)));
    return new Map(savedApps.map((app, index) => [app.id, details[index]?.screens[0] ?? null]));
  }, `saved-app-previews:${savedApps.map((app) => app.id).join(',')}`);
  const selectedApps = [...selected]
    .reverse()
    .map((id) => savedApps.find((app) => app.id === id))
    .filter((app): app is App => Boolean(app));

  const count = (t: SavedTab) =>
    t === 'all'
      ? items.length
      : t === 'apps'
        ? savedAppIds.length
      : t === 'screens'
        ? screenIds.length
        : t === 'flows'
          ? flowIds.length
          : t === 'patterns'
            ? patternIds.length
            : components.length;

  const total = items.length;

  const collectionHeader = collection ? (
    <header className="ins-collection-detail-head">
      <div className="ins-collection-detail-title">
        <Link href={INSPIRATIONS_ROUTES.collections} className="ins-collections-back" aria-label="Back to collections">
          <img src="/ASSET/Icons/Motvin/colletion-back.svg" alt="" width={58} height={58} />
        </Link>
        <h1 className="ins-title">{collection.name}</h1>
      </div>
      <button
        type="button"
        className="ins-collection-remove"
        onClick={() => {
          if (window.confirm(`Remove "${collection.name}"? Items stay in Saved.`)) {
            deleteCollection(collection.id);
            router.push(INSPIRATIONS_ROUTES.collections);
          }
        }}
      >
        <img src="/ASSET/Icons/Motvin/colletion-delete.svg" alt="" width={20} height={20} />
        Remove Collection
      </button>
    </header>
  ) : (
    <PageHeading
      title="Saved"
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
  );

  return (
    <section className={collection ? 'ins-collection-detail' : undefined}>
      {collectionHeader}

      <div className={`ins-tabbar ${collection ? 'ins-collection-detail-tabs' : ''}`} role="tablist" aria-label="Saved type">
        {tabs.map((t) => (
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
                  Screens
                </h2>
              )}
              <ScreenGrid screens={screens} apps={apps} />
            </section>
          )}

          {(tab === 'all' || tab === 'flows') && (flows ?? []).length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && (
                <h2 className="ins-section-title">
                  Flows
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
                  Patterns
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
                  Components
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

          {(tab === 'all' || tab === 'apps') && savedApps.length > 0 && (
            <section className="ins-result-section">
              {tab === 'all' && <h2 className="ins-section-title">
                Apps
              </h2>}
              {appPreviewsLoading ? (
                <div className="ins-grid" aria-busy="true" />
              ) : (
                <>
                  <div className="ins-grid" role="list">
                    {savedApps.map((app) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        preview={appPreviews?.get(app.id)}
                        selected={selected.has(app.id)}
                        onToggleSelect={() => toggle(app.id)}
                      />
                    ))}
                  </div>
                  {selectedApps.length > 0 && <FloatCollectionBar apps={selectedApps} onClose={clear} onSaved={clear} />}
                </>
              )}
            </section>
          )}

          {tab !== 'all' && count(tab) === 0 && (
            <EmptyState title={`No saved ${tab}`} action={{ label: 'Show everything', onClick: () => setParam('type', null) }} />
          )}
        </div>
      )}
    </section>
  );
}
