'use client';

import { appCardScreens } from '@/lib/inspirations/cover';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState, useSyncExternalStore, type FormEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { splitScreenItemId } from '@/lib/inspirations/savedItems';
import type { App, CollectionItem, Screen } from '@/lib/inspirations/types';
import { AppCard } from '../AppCard';
import { CollectionCard } from '../CollectionCard';
import { EmptyState } from '../EmptyState';
import { FlowList } from '../FlowList';
import { FlowListSkeleton } from '../Skeletons';
import { FloatCollectionBar } from '../FloatCollectionBar';
import { askConfirm } from '../ConfirmDialog';
import { BookmarkIcon, CloseIcon } from '../Icons';
import { PageHeading } from '../PageHeading';
import { PatternCard } from '../PatternCard';
import { ScreenGrid } from '../ScreenGrid';
import { useApps } from '../useApps';
import { useAsync } from '../useAsync';
import { useToast } from '../Toast';
import { useDeleteCollection } from '../useDeleteCollection';
import { useLibrary } from '../useLibrary';
import { sameItem, useRemoveWithUndo } from '../useRemoveWithUndo';
import { useAppSelection } from '../useAppSelection';
import { useScreensByIds } from '../useScreensByIds';

const noSubscribe = () => () => {};

type SavedTab = 'apps' | 'screens' | 'flows' | 'patterns' | 'components';

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
  const { collections, createCollection, renameCollection } = useLibrary();
  const deleteWithUndo = useDeleteCollection();
  const apps = useApps();
  const { show } = useToast();
  // Takes one thing out, and says so.
  const removeWithUndo = useRemoveWithUndo();
  // Takes one thing out, and says so, with an Undo.
  const removeItem = (collectionId: string, item: { type: CollectionItem['type']; id: string }) =>
    removeWithUndo([{ collectionId, match: sameItem(item.type, item.id) }]);
  const { selected, toggle, clear } = useAppSelection();
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  // Collections live in this browser, so the server can't know them: until
  // the page is up, show nothing rather than flash "Save what inspires you"
  // (or the list, on a link to one collection).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);

  const collectionId = params.get('collection');
  const collection = collections.find((c) => c.id === collectionId);

  const rawTab = params.get('type');

  const onCreateBoard = (e: FormEvent) => {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    const created = createCollection(newBoardName);
    show(`Created “${created.name}”`);
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
  // UI elements, and patterns saved from the Patterns page, are screens too
  // (`<screenId>:<tag>`): shown as screen cards, each screen once.
  const screensOf = (type: 'component' | 'pattern') => [
    ...new Set(items.filter((i) => i.type === type).map((i) => splitScreenItemId(i.id)?.screenId).filter((id): id is string => Boolean(id))),
  ];
  const componentScreenIds = screensOf('component');
  const patternScreenIds = screensOf('pattern');
  const { screens: screenMap, loading: screensLoading } = useScreensByIds([...new Set([...screenIds, ...componentScreenIds, ...patternScreenIds])]);
  const toScreens = (ids: string[]) => ids.map((id) => screenMap.get(id)).filter((s): s is Screen => Boolean(s));
  const screens = toScreens(screenIds);
  const componentScreens = toScreens(componentScreenIds);
  const patternScreens = toScreens(patternScreenIds);
  // Takes out every item of that type saved from this screen.
  const removeScreenItems = (type: 'component' | 'pattern', screenId: string, what: string) => {
    if (!collection) return;
    void askConfirm({ title: `Remove this ${what}?`, description: `It will be removed from “${collection.name}”.` }).then((ok) => {
      if (!ok) return;
      removeWithUndo([
        { collectionId: collection.id, match: (item) => item.type === type && splitScreenItemId(item.id)?.screenId === screenId },
      ]);
    });
  };

  const flowIds = items.filter((i) => i.type === 'flow').map((i) => i.id);
  const { data: flows, loading: flowsLoading } = useAsync(
    async () => {
      const found = await Promise.all(flowIds.map((id) => inspirationsApi.getFlow(id)));
      return found.filter(Boolean).map((f) => f!);
    },
    `saved-flows:${flowIds.join(',')}`,
  );

  const patternIds = items.filter((i) => i.type === 'pattern').map((i) => i.id);
  const { data: allPatterns } = useAsync(() => inspirationsApi.listPatterns(), 'patterns');
  // Patterns saved from their own page, by the pattern's plain id.
  const patterns = (allPatterns ?? []).filter((p) => patternIds.includes(p.id));

  const savedAppIds = items.filter((i) => i.type === 'app').map((i) => i.id);
  const savedApps = savedAppIds.map((id) => apps.get(id)).filter((app): app is App => Boolean(app));
  const { data: appPreviews, loading: appPreviewsLoading } = useAsync(async () => {
    const details = await Promise.all(savedApps.map((app) => inspirationsApi.getApp(app.id)));
    return new Map(savedApps.map((app, index) => [app.id, appCardScreens(app, details[index]?.screens ?? [])]));
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
            ? patterns.length + patternScreenIds.length
            : componentScreenIds.length;

  const total = items.length;
  // No tab in the URL: the first one with something in it.
  const tab: SavedTab = COLLECTION_TABS.some((t) => t.id === rawTab)
    ? (rawTab as SavedTab)
    : (COLLECTION_TABS.find((t) => count(t.id) > 0)?.id ?? 'apps');

  // Renaming in place: Enter or leaving saves a real change; a blank name
  // keeps the old one.
  const startRename = () => {
    if (!collection) return;
    setDraftName(collection.name);
    setRenaming(true);
  };
  const commitRename = () => {
    if (!renaming || !collection) return;
    const next = draftName.trim();
    if (next && next !== collection.name) {
      const final = renameCollection(collection.id, next);
      show(final && final !== next ? `Renamed to “${final}” — that name was taken` : 'Collection renamed');
    }
    setRenaming(false);
  };

  // --- Boards grid (no ?collection=): boards + create-board panel only. No
  // tab strip here — type-browsing lives inside a board, not duplicated at
  // this level too.
  if (!hydrated) {
    return <section aria-busy="true">{!collectionId && <PageHeading keep title="Collections" />}</section>;
  }

  if (!collection) {
    return (
      <section>
        <PageHeading
          keep
          title="Collections"
          actions={
            creatingBoard ? (
              <form className="ins-collections-create" onSubmit={onCreateBoard}>
                <input
                  className="ins-collections-create-input"
                  placeholder="Collection name"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  autoFocus
                  aria-label="New collection name"
                  maxLength={48}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setNewBoardName('');
                      setCreatingBoard(false);
                    }
                  }}
                />
                <button
                  type="button"
                  className="ins-collections-cancel"
                  onClick={() => {
                    setNewBoardName('');
                    setCreatingBoard(false);
                  }}
                >
                  Cancel
                </button>
                {/* Enter works too; this makes the way to finish plain. */}
                <button type="submit" className="ins-collections-new ins-collections-create-ok" disabled={!newBoardName.trim()}>
                  Create
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
          <div className="ins-collempty">
            <div className="ins-collempty-stack" aria-hidden>
              <span className="ins-collempty-tile ins-collempty-tile--a" />
              <span className="ins-collempty-tile ins-collempty-tile--b" />
              <span className="ins-collempty-tile ins-collempty-tile--c">
                <BookmarkIcon size={26} />
              </span>
            </div>
            <h2>Save what inspires you</h2>
            <p>Group screens, apps, flows and patterns into boards you can come back to.</p>
            <div className="ins-collempty-actions">
              <Link href={INSPIRATIONS_ROUTES.explore} className="ins-collempty-primary">
                Start exploring
              </Link>
            </div>
          </div>
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
          {renaming ? (
            <form
              className="ins-collection-title-form"
              onSubmit={(e) => {
                e.preventDefault();
                commitRename();
              }}
            >
              <input
                className="ins-title ins-collection-title-input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onFocus={(e) => {
                  const end = e.currentTarget.value.length;
                  e.currentTarget.setSelectionRange(end, end);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setRenaming(false);
                  }
                }}
                onBlur={commitRename}
                autoFocus
                maxLength={48}
                aria-label="Collection name"
              />
            </form>
          ) : (
            <h1
              className="ins-title ins-collection-title-edit"
              title="Click to rename"
              tabIndex={0}
              role="button"
              aria-label={`${collection.name}, click to rename`}
              onClick={startRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  startRename();
                }
              }}
            >
              {collection.name}
            </h1>
          )}
        </div>
        {/* Clicking the title renames it in place; the bin removes the
            collection, after asking. */}
        <div className="ins-masthead-actions">
          <button
            type="button"
            className="ins-btn ins-btn--masthead-store ins-collection-remove"
            onClick={() => {
              void askConfirm({
                title: `Remove “${collection.name}”?`,
                description: 'This will delete the collection and everything saved in it.',
                confirmLabel: 'Remove collection',
              }).then((ok) => {
                if (!ok) return;
                deleteWithUndo(collection.id);
                router.push(INSPIRATIONS_ROUTES.collections);
              });
            }}
          >
            {/* delete.svg, inline so it takes the text colour (red on hover). */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M4.25 14.75C3.8375 14.75 3.4845 14.6032 3.191 14.3097C2.8975 14.0162 2.7505 13.663 2.75 13.25V3.5H2V2H5.75V1.25H10.25V2H14V3.5H13.25V13.25C13.25 13.6625 13.1032 14.0157 12.8097 14.3097C12.5162 14.6037 12.163 14.7505 11.75 14.75H4.25ZM11.75 3.5H4.25V13.25H11.75V3.5ZM5.75 11.75H7.25V5H5.75V11.75ZM8.75 11.75H10.25V5H8.75V11.75Z"
                fill="currentColor"
              />
            </svg>
            Remove collection
          </button>
        </div>
      </header>

      <div className="ins-tabbar ins-collection-detail-tabs" role="tablist" aria-label="Item type">
        {COLLECTION_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`ins-tab ${tab === t.id ? 'is-active' : ''}`}
            onClick={() => setParam('type', t.id)}
          >
            {t.label}
            {count(t.id) > 0 && <span className="ins-tab-count">{count(t.id)}</span>}
          </button>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState
          play
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
                loading={screensLoading}
                showApp={false}
                showMeta={false}
                onRemoveItem={(id) => {
                  void askConfirm({ title: 'Remove this screen?', description: `It will be removed from “${collection.name}”.` }).then((ok) => {
                    if (ok) removeItem(collection.id, { type: 'screen', id });
                  });
                }}
                empty={<EmptyState
                    play
                    title="No saved screens"
                    description="Hover any screen and press Save to keep it here."
                    action={{ label: 'Explore screens', href: INSPIRATIONS_ROUTES.screens }}
                  />}
              />
            </section>
          )}

          {tab === 'flows' && (
            <section className="ins-result-section">
              {flowIds.length > 0 && flowsLoading ? (
                <FlowListSkeleton />
              ) : (flows ?? []).length === 0 ? (
                <EmptyState
                  play
                  title="No saved flows"
                  description="Select flows and save them to keep them here."
                  action={{ label: 'Explore flows', href: INSPIRATIONS_ROUTES.flows }}
                />
              ) : (
                <FlowList
                  entries={flows ?? []}
                  apps={apps}
                  onRemove={(flow) => {
                    void askConfirm({ title: `Remove “${flow.name}”?`, description: `It will be removed from “${collection.name}”.` }).then((ok) => {
                      if (ok) removeItem(collection.id, { type: 'flow', id: flow.id });
                    });
                  }}
                />
              )}
            </section>
          )}

          {tab === 'patterns' && (
            <section className="ins-result-section">
              {patternScreenIds.length > 0 && screensLoading ? (
                <div className="ins-shot-panel">
                  <ScreenGrid screens={[]} loading showMeta={false} />
                </div>
              ) : patterns.length === 0 && patternScreens.length === 0 ? (
                <EmptyState
                  play
                  title="No saved patterns"
                  description="Select pattern screens and save them to keep them here."
                  action={{ label: 'Explore patterns', href: INSPIRATIONS_ROUTES.patterns }}
                />
              ) : (
                <>
                  {patterns.length > 0 && (
                    <div className="ins-pattern-grid-wrap">
                      {patterns.map((p) => (
                        <div key={p.id} style={{ position: 'relative' }}>
                          <PatternCard pattern={p} />
                          <button
                            type="button"
                            className="ins-card-remove-btn"
                            aria-label={`Remove ${p.name}`}
                            style={{ top: 12, right: 12, zIndex: 10 }}
                            onClick={(e) => {
                              e.preventDefault();
                              void askConfirm({ title: `Remove “${p.name}”?`, description: `It will be removed from “${collection.name}”.` }).then((ok) => {
                                if (ok) removeItem(collection.id, { type: 'pattern', id: p.id });
                              });
                            }}
                          >
                            <CloseIcon size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {patternScreens.length > 0 && (
                    <div className="ins-shot-panel">
                      <ScreenGrid
                        screens={patternScreens}
                        apps={apps}
                        showApp={false}
                        showMeta={false}
                        onRemoveItem={(id) => removeScreenItems('pattern', id, 'pattern')}
                      />
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {tab === 'components' && (
            <section className="ins-result-section ins-shot-panel">
              <ScreenGrid
                screens={componentScreens}
                apps={apps}
                loading={screensLoading}
                showApp={false}
                showMeta={false}
                onRemoveItem={(id) => removeScreenItems('component', id, 'UI element')}
                empty={<EmptyState
                    play
                    title="No saved UI elements"
                    description="Select screens on UI Elements and save them to keep them here."
                    action={{ label: 'Explore UI elements', href: INSPIRATIONS_ROUTES.uiElements }}
                  />}
              />
            </section>
          )}

          {tab === 'apps' && (
            <section className="ins-result-section">
              {savedApps.length === 0 ? (
                <EmptyState
                  play
                  title="No saved apps"
                  description="Hover any app and press Save to keep it here."
                  action={{ label: 'Explore apps', href: INSPIRATIONS_ROUTES.apps }}
                />
              ) : appPreviewsLoading ? (
                <div className="ins-grid" aria-busy="true" />
              ) : (
                <>
                  {/* Explore's app grid inside Explore's own scope (.ins-explore-view:
                      no dim on hover, its offsets), so a saved app is the very
                      card Explore shows, with the × in its select circle's spot. */}
                  <div className="ins-explore-view">
                    <div className="ins-grid ins-app-grid" role="list">
                      {savedApps.map((app) => (
                        <AppCard
                          key={app.id}
                          app={app}
                          previewScreens={appPreviews?.get(app.id)}
                          onRemove={() => {
                            void askConfirm({ title: `Remove “${app.name}”?`, description: `It will be removed from “${collection.name}”.` }).then((ok) => {
                              if (ok) removeItem(collection.id, { type: 'app', id: app.id });
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      )}
    </section>
  );
}
