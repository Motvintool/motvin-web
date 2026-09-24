'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, type FormEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { elementLabel } from '@/lib/inspirations/taxonomy';
import type { App, CollectionItem, Screen } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { CollectionCard } from '../CollectionCard';
import { EmptyState } from '../EmptyState';
import { FlowCard } from '../FlowCard';
import { FloatCollectionBar } from '../FloatCollectionBar';
import { BookmarkIcon, FolderIcon, PlusIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { ScreenGrid } from '../ScreenGrid';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useLibrary } from '../useLibrary';
import { useAppSelection } from '../useAppSelection';
import { useScreensByIds } from '../useScreensByIds';

type SavedTab = 'apps' | 'screens' | 'flows' | 'patterns' | 'components';

/** Suggested starting boards for a visitor with none yet. */
const BOARD_STARTERS = ['My Inspiration', 'Dashboard Ideas', 'Checkout References', 'AI Products', 'Mobile Navigation'];

const COLLECTION_TABS: { id: SavedTab; label: string }[] = [
  { id: 'apps', label: 'Apps' },
  { id: 'screens', label: 'Screens' },
  { id: 'components', label: 'UI Elements' },
  { id: 'flows', label: 'Flows' },
  { id: 'patterns', label: 'Patterns' },
];

/**
 * /inspirations/collections — the visitor's boards. Bare, it's the boards
 * grid; `?collection=<id>` opens one board's contents behind its own
 * Apps/Screens/UI Elements/Flows/Patterns tabs — every dimension a
 * "browse everything by type" view would have offered, a real board already
 * has, so there's no separate flat-list destination duplicating it.
 * `/inspirations/saved` used to be that second, overlapping entry point; it
 * now redirects here (next.config.ts).
 */
export function SavedView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { collections, createCollection, deleteCollection } = useLibrary();
  const apps = useApps();
  const { selected, toggle, clear } = useAppSelection();
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');

  const collectionId = params.get('collection');
  const collection = collections.find((c) => c.id === collectionId);

  const rawTab = params.get('type');
  const tab: SavedTab = COLLECTION_TABS.some((t) => t.id === rawTab) ? (rawTab as SavedTab) : 'apps';

  const onCreateBoard = (e: FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    createCollection(newBoardName);
    setNewBoardName('');
    setCreatingBoard(false);
  };

  const setParam = (key: string, value: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (value) sp.set(key, value);
    else sp.delete(key);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const items: CollectionItem[] = useMemo(() => {
    if (!collection) return [];
    return [...collection.items].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }, [collection]);

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
    t === 'apps'
      ? savedAppIds.length
      : t === 'screens'
        ? screenIds.length
        : t === 'flows'
          ? flowIds.length
          : t === 'patterns'
            ? patternIds.length
            : components.length;

  const total = items.length;

  // --- Boards grid (no ?collection=): boards + create-board panel only. No
  // tab strip here — type-browsing lives inside a board, not duplicated at
  // this level too.
  if (!collection) {
    return (
      <section>
        <PageHeading
          title="Collections"
          actions={
            creatingBoard ? (
              <form className="ins-collections-create" onSubmit={onCreateBoard}>
                <input
                  className="ins-collections-create-input"
                  placeholder="Collection Name"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  autoFocus
                  aria-label="New collection name"
                  maxLength={48}
                />
                <button type="button" className="ins-collections-cancel" onClick={() => setCreatingBoard(false)}>
                  Cancel
                </button>
              </form>
            ) : (
              <button type="button" className="ins-collections-new" onClick={() => setCreatingBoard(true)}>
                <img src="/ASSET/Icons/Motvin/colletion-new.svg" alt="" width={16} height={16} />
                New collection
              </button>
            )
          }
        />

        {collections.length === 0 ? (
          <>
            <EmptyState
              icon={<FolderIcon size={22} />}
              title="No collections yet"
              description="Collections are visual boards. Save screens, apps, flows and patterns into them as you explore."
              action={{ label: 'Start exploring', href: INSPIRATIONS_ROUTES.explore }}
            />
            <div className="ins-starters">
              <p className="ins-muted">Start with a board:</p>
              <div className="ins-chips">
                {BOARD_STARTERS.map((s) => (
                  <button key={s} type="button" className="ins-chip" onClick={() => createCollection(s)}>
                    <PlusIcon size={12} /> {s}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="ins-collection-grid">
            {collections.map((c) => (
              <CollectionCard key={c.id} collection={c} apps={apps} />
            ))}
          </div>
        )}
      </section>
    );
  }

  // --- One board's contents — Apps/Screens/UI Elements/Flows/Patterns tabs.
  return (
    <section className="ins-collection-detail">
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
            if (window.confirm(`Remove "${collection.name}"?`)) {
              deleteCollection(collection.id);
              router.push(INSPIRATIONS_ROUTES.collections);
            }
          }}
        >
          <img src="/ASSET/Icons/Motvin/colletion-delete.svg" alt="" width={20} height={20} />
          Remove Collection
        </button>
      </header>

      <div className="ins-tabbar ins-collection-detail-tabs" role="tablist" aria-label="Item type">
        {COLLECTION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setParam('type', t.id === 'apps' ? null : t.id)}
          >
            {t.label}
            {count(t.id) > 0 && <span className="ins-tab-count">{count(t.id)}</span>}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<BookmarkIcon size={22} />}
          title="This collection is empty"
          description="Hover any screen and press Save, or add it to a collection."
          action={{ label: 'Explore screens', href: INSPIRATIONS_ROUTES.explore }}
        />
      ) : (
        <div className="ins-results">
          {tab === 'screens' && (
            <section className="ins-result-section ins-shot-panel">
              <ScreenGrid
                screens={screens}
                apps={apps}
                showApp={false}
                showMeta={false}
                selectable
                empty={<EmptyState title="No saved screens" />}
              />
            </section>
          )}

          {tab === 'flows' && (
            <section className="ins-result-section">
              {(flows ?? []).length === 0 ? (
                <EmptyState title="No saved flows" />
              ) : (
                <div className="ins-flow-grid">
                  {(flows ?? []).map(({ flow, screens: flowScreens }) => (
                    <FlowCard key={flow.id} flow={flow} screens={flowScreens} app={apps.get(flow.appId)} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'patterns' && (
            <section className="ins-result-section">
              {patterns.length === 0 ? (
                <EmptyState title="No saved patterns" />
              ) : (
                <div className="ins-pattern-grid-wrap">
                  {patterns.map((p) => (
                    <PatternCard key={p.id} pattern={p} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === 'components' && (
            <section className="ins-result-section">
              {components.length === 0 ? (
                <EmptyState title="No saved components" />
              ) : (
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
              )}
            </section>
          )}

          {tab === 'apps' && (
            <section className="ins-result-section">
              {savedApps.length === 0 ? (
                <EmptyState title="No saved apps" />
              ) : appPreviewsLoading ? (
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
        </div>
      )}
    </section>
  );
}
