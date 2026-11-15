'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { useLibraryParams } from '@/hooks/useLibraryParams';
import { useLibraryStats } from '@/hooks/useLibraryStats';
import { useSavedCollections } from '@/hooks/useSavedCollections';
import { AbortedError, loadItems } from '@/lib/api/load';
import type { LibraryItem } from '@/lib/api/normalize';
import { PAGE_SIZE, type CategoryConfig } from '@/lib/config/categories';
import { editorFromGlobals, exportSvgFor } from '@/lib/render/editor';
import { CompareModal } from './CompareModal';
import { DetailModal } from './DetailModal';
import { FiltersPanel } from './FiltersPanel';
import { LibraryGrid } from './LibraryGrid';
import { LocalFolderModal } from './LocalFolderModal';
import { MultiActionsStrip } from './MultiActionsStrip';
import { Pagination } from './Pagination';
import { RightPanel } from './RightPanel';
import { SaveCollectionModal } from './SaveCollectionModal';
import { SavedPanel } from './SavedPanel';
import { SortBar, sortItems } from './SortBar';
import { useToast } from './Toast';
import { LibraryToolbar } from './LibraryToolbar';
import { LibraryTopHeader } from './LibraryTopHeader';
import type { SidebarTab } from './LibrarySidebar';
import { useRequireLogin } from './useRequireLogin';

/**
 * Everything on the library page that depends on the query string.
 *
 * Split from LibraryView because `useSearchParams` makes its nearest Suspense
 * boundary client-only during static generation — keeping it here means the
 * shell and sidebar still prerender into the HTML.
 */

type Props = {
  config: CategoryConfig;
  sidebarTab: SidebarTab;
  onSelectTab: (tab: SidebarTab) => void;
  panelOpen: boolean;
  onClosePanel: () => void;
};

type Results =
  | { status: 'loading' }
  | { status: 'ready'; items: LibraryItem[]; total: number }
  | { status: 'error'; message: string };

export function LibraryResults({ config, sidebarTab, onSelectTab, panelOpen, onClosePanel }: Props) {
  const { params, setParams } = useLibraryParams();
  const stats = useLibraryStats(config.slug);
  const display = useDisplaySettings(config);
  const saved = useSavedCollections(config);

  // One piece of state for the whole request, so loading and data can never
  // disagree.
  const [results, setResults] = useState<Results>({ status: 'loading' });
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [saveModalItemId, setSaveModalItemId] = useState<string | null>(null);
  const [localFolderOpen, setLocalFolderOpen] = useState(false);
  const toast = useToast();
  const requireLogin = useRequireLogin();

  const globals = useMemo(
    () => ({ size: display.size, stroke: display.stroke, color: display.color }),
    [display.size, display.stroke, display.color],
  );

  // Guards against an older response landing after a newer one.
  const requestIdRef = useRef(0);

  // Serialised so the effect doesn't re-run just because the params object
  // holds fresh arrays on every render.
  const filterKey = [
    params.sources.join(','),
    params.styles.join(','),
    params.categories.join(','),
    params.licenses.join(','),
    params.saved ? '1' : '0',
  ].join('|');

  const savedIdList = saved.allSavedIds;
  const savedKey = params.saved ? savedIdList.join(',') : '';

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;

    // Reset to the loading state so the stale item cards don't linger while
    // the new query is in flight — otherwise clicks on old cards can fire
    // handlers bound to items that are about to be replaced, and the click
    // hits the wrong card after search.
    setResults({ status: 'loading' });
    // Any pending selection was tied to the previous result set — clear it
    // so the multi-actions strip doesn't shift the grid down mid-search.
    setSelectedIds(new Set());

    loadItems({
      category: config.slug,
      query: params.query,
      page: params.page,
      sources: params.sources,
      styles: params.styles,
      categories: params.categories,
      licenses: params.licenses,
      savedIds: params.saved ? savedIdList : undefined,
    })
      .then((result) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setResults({ status: 'ready', items: result.items, total: result.total });
      })
      .catch((err) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        // A superseded search isn't a failure — the newer one owns the UI now.
        if (err instanceof AbortedError) return;
        setResults({
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to load',
        });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterKey and
    // savedKey stand in for arrays that are new references every render.
  }, [config.slug, params.query, params.page, filterKey, savedKey]);

  const loading = results.status === 'loading';
  const rawItems = results.status === 'ready' ? results.items : [];
  const total = results.status === 'ready' ? results.total : 0;
  const error = results.status === 'error' ? results.message : null;

  // Sorting is applied to the fetched page, not the whole result set — see the
  // note in SortBar.tsx.
  const items = useMemo(() => sortItems(rawItems, params.sort), [rawItems, params.sort]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const detailItem = useMemo(
    () => items.find((i) => i.id === detailId) ?? null,
    [items, detailId],
  );

  /** Arrow keys and the modal's chevrons step through the current page. */
  const navigateDetail = useCallback(
    (offset: number) => {
      if (!detailId) return;
      const index = items.findIndex((i) => i.id === detailId);
      if (index < 0) return;
      const next = items[index + offset];
      if (next) setDetailId(next.id);
    },
    [detailId, items],
  );

  const handleToggleSelect = useCallback((item: LibraryItem) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }, []);

  /** Selects every item on the page, or clears when they already all are. */
  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSelected = items.length > 0 && items.every((i) => prev.has(i.id));
      return allSelected ? new Set() : new Set(items.map((i) => i.id));
    });
  }, [items]);

  const handleSaveSelection = useCallback(() => {
    for (const id of selectedIds) {
      if (!saved.savedIdSet.has(id)) saved.toggleItem(id);
    }
    toast.show(`${selectedIds.size} saved`);
  }, [selectedIds, saved, toast]);

  const handleOpen = useCallback((item: LibraryItem) => setDetailId(item.id), []);

  const handleCopy = useCallback(
    async (item: LibraryItem) => {
      // Copy is gated behind sign-in the same way motvin-icons.js:3268 was —
      // anonymous visitors open the login modal instead.
      if (!requireLogin()) return;
      // Card copy uses the grid's current settings, so what lands on the
      // clipboard matches what's on screen. `exportSvgFor` fetches an
      // imageUrl-only illustration first so the clipboard gets real SVG
      // markup instead of an <img> tag — port of illustrations.js:2038.
      const svg = await exportSvgFor(
        item,
        editorFromGlobals(item, globals),
        config.slug,
      );
      if (!svg) {
        toast.show('Copy failed — no SVG source for this item');
        return;
      }
      try {
        await navigator.clipboard.writeText(svg);
        toast.show('SVG copied');
      } catch {
        toast.show('Copy failed — clipboard unavailable');
      }
    },
    [globals, toast, requireLogin, config.slug],
  );

  // Reference (`:52488`) opens the collection-picker modal on every save
  // click, whether it's a card action or the detail modal — no silent
  // "toggle in default folder" shortcut. This lets the visitor pick which
  // collection (all of which are local-folder-backed).
  const handleToggleSave = useCallback(
    (item: LibraryItem) => setSaveModalItemId(item.id),
    [],
  );

  const handlePageChange = useCallback(
    (page: number) => {
      setParams({ page });
      document.getElementById('grid-scroll')?.scrollTo({ top: 0 });
    },
    [setParams],
  );

  const activeFilterCount =
    params.sources.length + params.styles.length + params.licenses.length +
    params.categories.length;

  return (
    <>
      <main className="mi-main" id="discover">
          <LibraryTopHeader config={config} onSelectSidebarTab={onSelectTab} />

          <LibraryToolbar
          config={config}
          totalItems={stats.total}
          query={params.query}
          onQueryChange={(query) => setParams({ query }, { replace: true })}
          categories={Object.keys(stats.counts.category)}
          categoryCounts={stats.counts.category}
          activeCategory={params.categories[0] ?? null}
          onCategoryChange={(category) =>
            setParams({ categories: category ? [category] : [] })
          }
          color={display.color}
          onColorChange={display.setColor}
          onColorReset={display.resetColor}
        />

        <div className="mi-main-top-wrapper">
          <SortBar
            sort={params.sort}
            onSortChange={(sort) => setParams({ sort })}
            total={total}
            loading={loading}
            compareCount={selectedIds.size}
            onOpenCompare={() => setCompareOpen(true)}
            density={display.density}
            onDensityChange={display.setDensity}
          />
          <MultiActionsStrip
            config={config}
            items={items}
            selectedIds={selectedIds}
            totalResults={total}
            query={params.query}
            globals={globals}
            onToggleAll={handleToggleAll}
            onClear={() => setSelectedIds(new Set())}
            onSaveSelection={handleSaveSelection}
            onToast={toast.show}
          />
        </div>

        <div className="mi-grid-scroll" id="grid-scroll">
          {error ? (
            <div className="mi-empty" role="alert">
              <p>
                Couldn&apos;t load {config.nounPlural}: {error}
              </p>
            </div>
          ) : (
            <LibraryGrid
              items={items}
              loading={loading}
              config={config}
              globals={globals}
              density={display.density}
              selectedIds={selectedIds}
              savedIds={saved.savedIdSet}
              onOpen={handleOpen}
              onToggleSelect={handleToggleSelect}
              onCopy={handleCopy}
              onToggleSave={handleToggleSave}
            />
          )}
        </div>

          <Pagination
            page={params.page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
      </main>

      <RightPanel
        activeTab={sidebarTab}
        onSelect={onSelectTab}
        open={panelOpen}
        onClose={onClosePanel}
        activeFilterCount={activeFilterCount}
        categoryCounts={stats.counts.category}
        totalItems={stats.total}
        activeCategories={params.categories}
        onCategoriesChange={(categories) => setParams({ categories })}
        filters={
          <FiltersPanel
            config={config}
            collections={stats.collections}
            counts={stats.counts}
            totalItems={stats.total}
            sources={params.sources}
            styles={params.styles}
            licenses={params.licenses}
            onSourcesChange={(sources) => setParams({ sources })}
            onStylesChange={(styles) => setParams({ styles })}
            onLicensesChange={(licenses) => setParams({ licenses })}
            onClearFilters={() =>
              setParams({ sources: [], styles: [], licenses: [], categories: [] })
            }
            size={display.size}
            onSizeChange={display.setSize}
            stroke={display.stroke}
            onStrokeChange={display.setStroke}
          />
        }
        saved={
          <SavedPanel
            folders={saved.folders}
            activeFolderId={saved.activeFolderId}
            showingSaved={params.saved}
            onSelectFolder={(id) => {
              saved.setActiveFolder(id);
              setParams({ saved: true });
            }}
            onShowAllSaved={() => {
              saved.setActiveFolder(null);
              setParams({ saved: !params.saved });
            }}
            onDeleteFolder={saved.deleteFolder}
            onConnectLocalFolder={() => setLocalFolderOpen(true)}
          />
        }
      />

      <div
        className={`mi-rp-mobile-backdrop${panelOpen ? ' is-open' : ''}`}
        id="rp-mobile-backdrop"
        onClick={onClosePanel}
      />


      <DetailModal
        item={detailItem}
        config={config}
        globals={globals}
        saved={detailItem ? saved.savedIdSet.has(detailItem.id) : false}
        items={items}
        savedIds={saved.savedIdSet}
        query={params.query}
        onClose={() => setDetailId(null)}
        // Legacy: the detail modal's Save opens the collection picker so the
        // visitor can pick which folder — quicker than the card save, which
        // still targets the default folder.
        onToggleSave={(item) => setSaveModalItemId(item.id)}
        onNavigate={navigateDetail}
        onToast={toast.show}
        onOpen={(item) => setDetailId(item.id)}
        onCopyCard={handleCopy}
        onCategoryClick={(category) => {
          setDetailId(null);
          setParams({ categories: [category] });
          document.getElementById('grid-scroll')?.scrollTo({ top: 0 });
        }}
        onTagClick={(tag) => {
          setDetailId(null);
          setParams({ query: tag, page: 1 }, { replace: true });
        }}
      />

      <CompareModal
        items={items.filter((it) => selectedIds.has(it.id))}
        config={config}
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
      />

      <SaveCollectionModal
        item={items.find((it) => it.id === saveModalItemId) ?? null}
        folders={saved.folders}
        onClose={() => setSaveModalItemId(null)}
        isSavedIn={(folderId) => saved.isSavedInFolder(saveModalItemId ?? '', folderId)}
        onToggleFolder={(folderId) => {
          const target = items.find((it) => it.id === saveModalItemId);
          if (!target) return;
          const wasSaved = saved.isSavedInFolder(target.id, folderId);
          saved.toggleItemInFolder(target, folderId);
          const folderName = saved.folders.find((f) => f.id === folderId)?.name ?? 'Collection';
          toast.show(wasSaved ? `Removed from "${folderName}"` : `Saved to "${folderName}"`);
        }}
        onConnectLocalFolder={() => setLocalFolderOpen(true)}
      />

      <LocalFolderModal
        open={localFolderOpen}
        onClose={() => setLocalFolderOpen(false)}
        onFolderSelected={async (handle) => {
          try {
            const id = await saved.connectLocalFolder(handle);
            // If there was a pending save target, drop it into the new folder.
            const target = items.find((it) => it.id === saveModalItemId);
            if (target) saved.toggleItemInFolder(target, id);
            toast.show(`Connected "${handle.name}"`);
          } catch (err) {
            toast.show(err instanceof Error ? err.message : 'Folder connect failed');
          }
        }}
      />
    </>
  );
}
