'use client';

import { useEffect, useState } from 'react';
import { localFoldersSupported, pickDirectory } from '@/lib/localFolders';
import { ModalPortal } from './ModalPortal';

/**
 * "Connect Local Folder" — port of the local-folder view in
 * Save Collection Modal.js (41–72, flow 315–422).
 *
 * Shares the SaveCollectionModal's house style: 380px card, `--mi-border` /
 * `--mi-ink` / `--mi-muted` / `--mi-bg-3` tokens, `.mi-btn-primary` /
 * `.mi-btn-secondary` for the actions, `.mi-modal-close` for the header
 * cross. This component knows nothing about persistence — it just picks a
 * directory and hands the handle back.
 */

type Props = {
  open: boolean;
  onClose: () => void;
  onFolderSelected: (handle: FileSystemDirectoryHandle) => void | Promise<void>;
};

export function LocalFolderModal({ open, onClose, onFolderSelected }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusy(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const supported = localFoldersSupported();

  if (!open) return null;

  const choose = async () => {
    setBusy(true);
    setError(null);
    try {
      const handle = await pickDirectory();
      if (!handle) {
        setBusy(false);
        return;
      }
      await onFolderSelected(handle);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Folder access failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalPortal>
    <div
      className="mi-modal is-open"
      id="local-folder-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Connect local folder"
    >
      <div
        className="mi-modal-backdrop"
        onClick={busy ? undefined : onClose}
        data-close
      />
      <div
        className="mi-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 380, width: '100%', borderRadius: 16, overflow: 'hidden' }}
      >
        {/* Header — matches SaveCollectionModal's header structure so both
            modals feel like one flow. */}
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
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
              Connect Local Folder
            </div>
            <div
              style={{ fontSize: 12, color: 'var(--mi-muted)', marginTop: 2 }}
            >
              Folder name becomes the collection name
            </div>
          </div>
          <button
            className="mi-modal-close"
            onClick={onClose}
            disabled={busy}
            data-close
            aria-label="Close"
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

        {/* Info body */}
        <div style={{ padding: '16px 20px' }}>
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '12px 14px',
              background: 'var(--mi-bg-3)',
              borderRadius: 10,
              border: '1px solid var(--mi-border)',
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--mi-ink-2)"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ flexShrink: 0, marginTop: 1 }}
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div style={{ fontSize: 12.5, color: 'var(--mi-ink-2)', lineHeight: 1.5 }}>
              {supported ? (
                <>
                  Items are saved as <code style={{ fontFamily: 'inherit' }}>.json</code> files
                  under the folder you choose. Existing files in the folder are automatically
                  imported.
                </>
              ) : (
                <>
                  Your browser can&apos;t pick a local directory. Try Chrome or Edge on desktop —
                  Firefox and Safari don&apos;t support this yet.
                </>
              )}
            </div>
          </div>
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 10,
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(217, 48, 37, 0.08)',
                border: '1px solid rgba(217, 48, 37, 0.24)',
                color: '#d93025',
                fontSize: 12.5,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer — same darker strip as SaveCollectionModal */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--mi-border)',
            background: 'var(--mi-bg-3)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="mi-btn-secondary"
            onClick={onClose}
            disabled={busy}
            data-close
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            Cancel
          </button>
          <button
            id="btnSelectFolder"
            type="button"
            className="mi-btn-primary"
            onClick={choose}
            disabled={!supported || busy}
            style={{ fontSize: 13, padding: '8px 14px' }}
          >
            {busy ? 'Working…' : 'Choose Folder'}
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
