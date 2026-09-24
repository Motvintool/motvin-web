'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_COLLECTION_NAME } from '@/lib/inspirations/store';
import type { App, Screen, SavedItemType } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { useLibrary } from './useLibrary';
import { ChevronDownIcon } from './Icons';

/** The stack only has room to show a few faces before they'd be unreadable. */
const MAX_LOGOS = 3;
/** How long the success state (Figma node 1039:40918) stays up before the
 * selection actually clears and the bar disappears — long enough to read,
 * short enough that it doesn't feel stuck. */
const SUCCESS_DURATION_MS = 1600;

/**
 * Floating bar for saving a selection — apps or screens — into a collection.
 * One flow either way: name it (pre-filled with the shared default board so
 * leaving it untouched is a one-click save) and submit. Screens used to have
 * their own shortcut here that skipped straight into a separate flat "Saved"
 * pool with no naming step; that pool had nowhere left to be viewed once the
 * standalone Saved page was removed, so it's gone — every save, app or
 * screen, goes through the one collection-based path Collections shows.
 * Figma: node 1067:48859 ("float-collection"), node 1039:40918
 * ("float-collection-success") for the confirmation it swaps to on save.
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
  const { collections, getOrCreateCollectionByName, addToCollection } = useLibrary();
  const [uiState, setUiState] = useState<'default' | 'expand' | 'add-new-collection'>('default');
  const [name, setName] = useState(DEFAULT_COLLECTION_NAME);
  // Support multi-select, defaulting to no collections selected
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(onSaved, SUCCESS_DURATION_MS);
    return () => clearTimeout(timer);
  }, [saved, onSaved]);

  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    let targetCollectionIds: string[] = [];

    if (uiState === 'add-new-collection') {
      const trimmed = name.trim();
      if (!trimmed) return;
      const collection = getOrCreateCollectionByName(trimmed);
      targetCollectionIds = [collection.id];
    } else {
      // 'default' or 'expand' -> save to selectedIds
      // If none selected, fallback to DEFAULT_COLLECTION_NAME
      if (selectedIds.length === 0) {
        const collection = getOrCreateCollectionByName(DEFAULT_COLLECTION_NAME);
        targetCollectionIds = [collection.id];
      } else {
        targetCollectionIds = selectedIds;
      }
    }

    const itemsToSave = items || (screens ? screens.map(s => ({ type: 'screen' as const, id: s.id })) : (apps || []).map(a => ({ type: 'app' as const, id: a.id })));
    
    for (const collectionId of targetCollectionIds) {
      for (const item of itemsToSave) {
        addToCollection(collectionId, item);
      }
    }
    setSaved(true);
  };

  const visualApps = apps ?? (screens && screenApp ? screens.map(() => screenApp) : []);
  const visible = visualApps.slice(0, MAX_LOGOS).reverse();
  const logosWidth = 54 + (visible.length - 1) * 22;

  let selectorText = 'Select Collections';
  if (selectedIds.length === 1) {
    selectorText = collections.find(c => c.id === selectedIds[0])?.name || 'Select Collections';
  } else if (selectedIds.length > 1) {
    selectorText = `${selectedIds.length} Selected`;
  }

  if (saved) {
    return (
      <div className="ins-float-collection" role="status" aria-live="polite">
        <div className="ins-float-collection-success">
          <span className="ins-float-collection-success-check" aria-hidden>
            <span />
          </span>
          Saved to collection
        </div>
      </div>
    );
  }

  return (
    <div className="ins-float-collection" role="region" aria-label="Save selected items to a collection">
      <form className={`ins-float-collection-bar ${uiState !== 'default' ? 'is-expanded' : ''}`} onSubmit={onSubmit}>
        <div className="ins-float-collection-list-wrapper">
          <div className="ins-float-collection-list-inner">
            <div className="ins-float-collection-list-container">
              <div className="ins-float-collection-list-title">Add to Collection</div>
              <div className="ins-float-collection-list">
                {collections.map(c => (
                  <div 
                    key={c.id} 
                    className="ins-float-collection-item"
                    onClick={() => {
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
                      {c.name}
                    </div>
                    <div className={`ins-float-collection-item-select ${selectedIds.includes(c.id) && uiState !== 'add-new-collection' ? 'is-active' : ''}`} />
                  </div>
                ))}
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
          <img
            src="/ASSET/Icons/Motvin/float-collection-arrow.svg"
            alt=""
            className="ins-float-collection-arrow"
            width={27}
            height={20}
          />
          
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
      <button type="button" className="ins-float-collection-close" aria-label="Cancel selection" onClick={onClose}>
        <img src="/ASSET/Icons/Motvin/float-collection-close.svg" alt="" width={20} height={20} />
      </button>
    </div>
  );
}
