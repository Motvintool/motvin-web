'use client';

import { useEffect } from 'react';
import type { LibraryItem } from '@/lib/api/normalize';
import type { SavedFolder } from '@/hooks/useSavedCollections';
import { localFoldersSupported } from '@/lib/localFolders';
import { ModalPortal } from './ModalPortal';

/**
 * Save-to-collection modal — port of Save Collection Modal.js.
 *
 * Styling matches the reference at `:52488`: 380px card, `--mi-border` /
 * `--mi-ink` / `--mi-muted` / `--mi-bg-3` tokens, `.mi-btn-primary` for the
 * footer action, `.mi-modal-close` for the header cross, and
 * `.mi-collections-list-modal` + `.mi-coll-modal-item` classes for the list.
 *
 * The only path forward is "New Collection from Folder" — every collection is
 * backed by an on-disk directory (no plain in-memory folders).
 */

type Props = {
  item: LibraryItem | null;
  folders: readonly SavedFolder[];
  onClose: () => void;
  /** Whether the given folder currently holds the item. */
  isSavedIn: (folderId: string) => boolean;
  onToggleFolder: (folderId: string) => void;
  onConnectLocalFolder: () => void;
};

export function SaveCollectionModal({
  item,
  folders,
  onClose,
  isSavedIn,
  onToggleFolder,
  onConnectLocalFolder,
}: Props) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  return (
    <ModalPortal>
    <div
      className="mi-modal is-open"
      id="collection-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Save to collection"
    >
      <div className="mi-modal-backdrop" onClick={onClose} data-close />
      <div
        className="mi-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 380, width: '100%', borderRadius: 16, overflow: 'hidden' }}
      >
        {/* Header — matches reference: 20/20/16 padding, hairline divider,
            dark chip with white heart glyph, name + item strong. */}
        <div
          style={{
            padding: '20px 20px 16px',
            borderBottom: '1px solid var(--mi-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: 9,
              background: 'var(--mi-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--mi-ink)',
                lineHeight: 1.2,
              }}
            >
              Save to Collection
            </div>
            <div
              style={{ fontSize: 12, color: 'var(--mi-muted)', marginTop: 2 }}
            >
              Item:{' '}
              <strong
                id="coll-modal-icon-name"
                style={{ color: 'var(--mi-ink-2)' }}
              >
                {item.name}
              </strong>
            </div>
          </div>
          <button
            className="mi-modal-close"
            onClick={onClose}
            data-close
            aria-label="Close"
            // Header slot: reset the .mi-modal-close absolute positioning so
            // it flows inline like reference (position: static; margin: 0).
            style={{ position: 'static', margin: 0 }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Body list */}
        <div
          id="coll-modal-list"
          className="mi-collections-list-modal"
          style={{
            maxHeight: 240,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {folders.length === 0 ? (
            <div className="mi-empty" style={{ padding: '20px 0', textAlign: 'center' }}>
              <p>No collections yet.</p>
            </div>
          ) : (
            folders.map((folder) => {
              const saved = isSavedIn(folder.id);
              // Rely on .mi-coll-modal-item / .is-saved for hover + selected
              // colouring — those live in library.css and stay in sync with
              // the theme without inline styles fighting them.
              return (
                <button
                  key={folder.id}
                  type="button"
                  className={`mi-coll-modal-item${saved ? ' is-saved' : ''}`}
                  data-folder-id={folder.id}
                  onClick={() => onToggleFolder(folder.id)}
                >
                  <span className="mi-coll-modal-name">{folder.name}</span>
                  <span className="mi-coll-modal-count">{folder.iconIds.length}</span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer — hairline top border on the darker `--mi-bg-3` strip, single
            primary action that opens the local-folder picker. */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--mi-border)',
            background: 'var(--mi-bg-3)',
          }}
        >
          {localFoldersSupported() ? (
            <button
              id="coll-new-btn"
              type="button"
              className="mi-btn-primary"
              onClick={() => {
                onClose();
                onConnectLocalFolder();
              }}
              style={{
                width: '100%',
                justifyContent: 'center',
                fontSize: 13,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                <line x1="12" y1="11" x2="12" y2="17" />
                <line x1="9" y1="14" x2="15" y2="14" />
              </svg>
              New Collection from Folder
            </button>
          ) : (
            // Firefox/Safari can't pick a local directory — communicate that
            // rather than showing an inert button.
            <p style={{ margin: 0, fontSize: 12, color: 'var(--mi-muted)', textAlign: 'center' }}>
              Local folder support isn&apos;t available in this browser.
            </p>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
