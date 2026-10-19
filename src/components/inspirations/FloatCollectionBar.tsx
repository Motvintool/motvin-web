'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_COLLECTION_NAME } from '@/lib/inspirations/store';
import type { App, Screen, SavedItemType } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { askConfirm } from './ConfirmDialog';
import { useToast } from './Toast';
import { useDeleteCollection } from './useDeleteCollection';
import { useLibrary } from './useLibrary';
import { SHEET_QUERY, useMediaQuery } from './useSheet';
import { ChevronDownIcon } from './Icons';

/** The stack only has room to show a few faces before they'd be unreadable. */
const MAX_LOGOS = 3;

/**
 * Floating bar for saving a selection — apps or screens — into a collection.
 * One flow either way: name it (pre-filled with the shared default board so
 * leaving it untouched is a one-click save) and submit. Screens used to have
 * their own shortcut here that skipped straight into a separate flat "Saved"
 * pool with no naming step; that pool had nowhere left to be viewed once the
 * standalone Saved page was removed, so it's gone — every save, app or
 * screen, goes through the one collection-based path Collections shows.
 * Figma: node 1067:48859 ("float-collection"). On save the bar goes and
 * "Saved to collection" comes up as a toast, stacking with any others.
 *
 * `apps` is expected most-recent-first (AppsGrid reverses the selection
 * Set's insertion order) so the logo stack's frontmost face is whichever app
 * was just checked, not whichever happened to render first in the grid.
 */
export function FloatCollectionBar({
  apps,
  screens,
  screenApp,
  items,
  onClose,
  onSaved,
}: {
  apps?: App[];
  screens?: Screen[];
  screenApp?: App;
  items?: { type: SavedItemType; id: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { collections, createCollection, getOrCreateCollectionByName, addToCollection, renameCollection } = useLibrary();
  const deleteWithUndo = useDeleteCollection();
  const { show } = useToast();
  // A phone's bar has room for one short word beside Save.
  const pickLabel = useMediaQuery(SHEET_QUERY) ? 'Collections' : 'Select Collections';
  const [uiState, setUiState] = useState<'default' | 'expand' | 'add-new-collection'>('default');
  const [name, setName] = useState(DEFAULT_COLLECTION_NAME);
  // Support multi-select, defaulting to no collections selected
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Right-click on a collection: its Rename / Delete menu, where the pointer is.
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // The menu closes on any click, scroll or Escape elsewhere.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, { capture: true });
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('keydown', onKey, true);
    };
  }, [menu]);

  const startRename = (id: string) => {
    setMenu(null);
    setRenameValue(collections.find((c) => c.id === id)?.name ?? '');
    setRenamingId(id);
  };
  // Enter or leaving it saves a real change; a blank name keeps the old one.
  const commitRename = () => {
    if (!renamingId) return;
    const current = collections.find((c) => c.id === renamingId);
    const next = renameValue.trim();
    if (current && next && next !== current.name) {
      const final = renameCollection(current.id, next);
      show(final && final !== next ? `Renamed to “${final}” — that name was taken` : 'Collection renamed');
    }
    setRenamingId(null);
  };
  const removeCollection = (id: string) => {
    setMenu(null);
    const target = collections.find((c) => c.id === id);
    if (!target) return;
    void askConfirm({
      title: `Delete “${target.name}”?`,
      description: 'This will delete the collection and everything saved in it.',
      confirmLabel: 'Delete collection',
    }).then((ok) => {
      if (!ok) return;
      deleteWithUndo(id);
      setSelectedIds((ids) => ids.filter((x) => x !== id));
    });
  };

  // Escape, like the other popups: first back out of the collection list or
  // the new-collection form, then cancel the selection. Left alone while a
  // dialog is open over the page (a preview), which owns the key then.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      if (uiState !== 'default') setUiState('default');
      else onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [uiState, onClose]);

  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    let targetCollectionIds: string[] = [];
    // The one collection it went into, to name in the toast.
    let targetName: string | undefined;

    if (uiState === 'add-new-collection') {
      const trimmed = name.trim();
      if (!trimmed) return;
      // Always a new one: a name already in use becomes "Name copy".
      const collection = createCollection(trimmed);
      targetCollectionIds = [collection.id];
      targetName = collection.name;
    } else {
      // 'default' or 'expand' -> save to selectedIds
      // If none selected, fallback to DEFAULT_COLLECTION_NAME
      if (selectedIds.length === 0) {
        const collection = getOrCreateCollectionByName(DEFAULT_COLLECTION_NAME);
        targetCollectionIds = [collection.id];
        targetName = collection.name;
      } else {
        targetCollectionIds = selectedIds;
        if (selectedIds.length === 1) targetName = collections.find((c) => c.id === selectedIds[0])?.name;
      }
    }

    const itemsToSave = items || (screens ? screens.map(s => ({ type: 'screen' as const, id: s.id })) : (apps || []).map(a => ({ type: 'app' as const, id: a.id })));
    
    for (const collectionId of targetCollectionIds) {
      for (const item of itemsToSave) {
        addToCollection(collectionId, item);
      }
    }
    show(
      targetName
        ? `Saved to “${targetName}”`
        : targetCollectionIds.length > 1
          ? `Saved to ${targetCollectionIds.length} collections`
          : 'Saved to collection',
    );
    onSaved();
  };

  const visualApps = apps ?? (screens && screenApp ? screens.map(() => screenApp) : []);
  const visible = visualApps.slice(0, MAX_LOGOS).reverse();
  const logosWidth = 54 + (visible.length - 1) * 22;

  const allSelected = collections.length > 0 && collections.every((c) => selectedIds.includes(c.id));

  let selectorText = pickLabel;
  if (selectedIds.length === 1) {
    selectorText = collections.find(c => c.id === selectedIds[0])?.name || pickLabel;
  } else if (selectedIds.length > 1) {
    selectorText = `${selectedIds.length} Selected`;
  }

  return (
    <div className="ins-float-collection" role="region" aria-label="Save selected items to a collection">
      <form className={`ins-float-collection-bar ${uiState !== 'default' ? 'is-expanded' : ''}`} onSubmit={onSubmit}>
        <div className="ins-float-collection-list-wrapper">
          <div className="ins-float-collection-list-inner">
            <div className="ins-float-collection-list-container">
              <div className="ins-float-collection-list-head">
                <div className="ins-float-collection-list-title">Add to Collection</div>
                {/* Once one is picked: every collection at once, or none again. */}
                {selectedIds.length > 0 && collections.length > 1 && uiState !== 'add-new-collection' && (
                  <button
                    type="button"
                    className="ins-float-collection-select-all"
                    onClick={() => setSelectedIds(allSelected ? [] : collections.map((c) => c.id))}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="ins-float-collection-list">
                {/* Six rows show; more scroll, with "Add to new collection" kept in view below. */}
                <div className="ins-float-collection-scroll">
                  {collections.map(c => (
                    <div 
                      key={c.id} 
                      className={`ins-float-collection-item ${menu?.id === c.id ? 'is-menu-open' : ''}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenu({ id: c.id, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 120) });
                      }}
                      onClick={() => {
                        if (renamingId === c.id) return;
                        if (selectedIds.includes(c.id)) {
                          setSelectedIds(selectedIds.filter(id => id !== c.id));
                        } else {
                          setSelectedIds([...selectedIds, c.id]);
                        }
                        setUiState('expand');
                      }}
                    >
                      <div className="ins-float-collection-item-label">
                        <img src="/ASSET/Icons/Motvin/collection-list.svg" alt="" width={22} height={22} style={{ opacity: 0.8 }} />
                        {renamingId === c.id ? (
                          // Renamed where it stands, in its own type: no box.
                          <input
                            className="ins-float-collection-item-rename"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onFocus={(e) => {
                              const end = e.currentTarget.value.length;
                              e.currentTarget.setSelectionRange(end, end);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitRename();
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                setRenamingId(null);
                              }
                            }}
                            onBlur={commitRename}
                            maxLength={48}
                            aria-label="Collection name"
                            autoFocus
                          />
                        ) : (
                          c.name
                        )}
                      </div>
                      <div className={`ins-float-collection-item-select ${selectedIds.includes(c.id) && uiState !== 'add-new-collection' ? 'is-active' : ''}`} />
                    </div>
                  ))}
                </div>
                <div 
                  className={`ins-float-collection-new ${uiState === 'add-new-collection' ? 'is-hidden' : ''}`}
                  onClick={() => {
                    setUiState('add-new-collection');
                    setName('');
                  }}
                >
                  <div className="ins-float-collection-new-label">
                    <img src="/ASSET/Icons/Motvin/add-new-collection.svg" alt="" width={22} height={22} style={{ opacity: 0.6 }} />
                    Add to new collection
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="ins-float-collection-main">
          <div className="ins-float-collection-logos" style={{ width: logosWidth }}>
            {visible.map((app, i) => (
              <span
                key={app.id}
                className="ins-float-collection-logo"
                style={{ left: 8 + (visible.length - 1 - i) * 22 }}
              >
                <AppLogo app={app} size={38} />
              </span>
            ))}
          </div>

          {uiState === 'add-new-collection' ? (
            <input
              type="text"
              className="ins-float-collection-input"
              placeholder="Collection Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={48}
              aria-label="Collection name"
              autoFocus
            />
          ) : (
            <div 
              className="ins-float-collection-selector"
              onClick={() => setUiState(uiState === 'default' ? 'expand' : 'default')}
            >
              <span className="truncate flex-1">{selectorText}</span>
              <ChevronDownIcon size={20} style={{ flex: 'none', transform: uiState === 'expand' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
            </div>
          )}

          <button 
            type="submit" 
            className="ins-float-collection-save" 
            disabled={(uiState === 'add-new-collection' && !name.trim()) || (uiState !== 'add-new-collection' && selectedIds.length === 0)}
          >
            Save
          </button>
        </div>
      </form>
      {menu &&
        createPortal(
          <div
            className="ins-context-menu"
            role="menu"
            aria-label="Collection actions"
            style={{ top: menu.y, left: menu.x, width: 180 }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button type="button" role="menuitem" className="ins-context-menu-btn" onClick={() => startRename(menu.id)}>
              <div className="ins-context-menu-btn-content">
                <div className="ins-context-menu-icon">
                  <img alt="" src="/ASSET/Icons/Motvin/edit.svg" />
                </div>
                <p className="ins-context-menu-text">Rename</p>
              </div>
            </button>
            <button type="button" role="menuitem" className="ins-context-menu-btn ins-context-menu-btn--danger" onClick={() => removeCollection(menu.id)}>
              <div className="ins-context-menu-btn-content">
                <div className="ins-context-menu-icon">
                  {/* delete.svg, inline so it takes the item's red. */}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                    <path
                      fillRule="evenodd"
                      clipRule="evenodd"
                      d="M4.25 14.75C3.8375 14.75 3.4845 14.6032 3.191 14.3097C2.8975 14.0162 2.7505 13.663 2.75 13.25V3.5H2V2H5.75V1.25H10.25V2H14V3.5H13.25V13.25C13.25 13.6625 13.1032 14.0157 12.8097 14.3097C12.5162 14.6037 12.163 14.7505 11.75 14.75H4.25ZM11.75 3.5H4.25V13.25H11.75V3.5ZM5.75 11.75H7.25V5H5.75V11.75ZM8.75 11.75H10.25V5H8.75V11.75Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
                <p className="ins-context-menu-text">Delete</p>
              </div>
            </button>
          </div>,
          document.body,
        )}
      <button type="button" className="ins-float-collection-close" aria-label="Cancel selection" onClick={onClose}>
        <img src="/ASSET/Icons/Motvin/float-collection-close.svg" alt="" width={20} height={20} />
      </button>
    </div>
  );
}
