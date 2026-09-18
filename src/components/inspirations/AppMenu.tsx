'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { downloadFiles, type ZipFile } from '@/lib/export/zip';
import type { App, Screen } from '@/lib/inspirations/types';
import { CopyIcon, DownloadIcon, ExternalIcon, MoreIcon } from './Icons';
import { useToast } from './Toast';

/**
 * The "…" menu on an app's masthead.
 *
 * Deliberately short. Every item here does something real — there is no
 * placeholder row for a feature that does not exist yet, because a menu that
 * lies about what the product can do is worse than a menu with three items.
 *
 * "Download all screens" honours the same rule the API does: a screen whose
 * app is recorded view-only is never handed over, so the count in the toast is
 * what was actually downloadable, not what was asked for.
 */
export function AppMenu({ app, screens }: { app: App; screens: Screen[] }) {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    setOpen((o) => !o);
  };

  const copyLink = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(window.location.href);
      show('Link copied');
    } catch {
      show('Could not copy the link');
    }
  };

  const downloadable = screens.filter((s) => s.downloadable);

  const downloadAll = async () => {
    setOpen(false);
    if (!downloadable.length) {
      show('These screens are view-only under their recorded licence');
      return;
    }

    setBusy(true);
    show(`Preparing ${downloadable.length} screen${downloadable.length === 1 ? '' : 's'}…`);
    try {
      const files: ZipFile[] = [];
      for (const screen of downloadable) {
        const url = inspirationsApi.mediaUrl(screen.url);
        if (!url) continue;
        const res = await fetch(url);
        if (!res.ok) continue;
        // The stored path already encodes flow and position, so a flow's
        // screens stay in order and together inside the archive.
        files.push({
          name: screen.file.replace(/^[a-z]+\//, ''),
          data: new Uint8Array(await res.arrayBuffer()),
          type: 'image/png',
        });
      }
      if (!files.length) {
        show('None of the screens could be fetched');
        return;
      }
      const count = downloadFiles(files, `${app.slug}-screens.zip`);
      show(`Downloaded ${count} screen${count === 1 ? '' : 's'}`);
    } catch (error) {
      show((error as Error).message || 'Download failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ins-appmenu" ref={rootRef}>
      <button
        type="button"
        className="ins-iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        onClick={toggle}
        disabled={busy}
      >
        <MoreIcon size={16} />
      </button>

      {open && (
        <div className="ins-popover ins-appmenu-panel" role="menu">
          {app.website && (
            <a
              className="ins-popover-item"
              role="menuitem"
              href={app.website}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
            >
              <ExternalIcon size={16} />
              <span className="ins-popover-item-label">Visit website</span>
            </a>
          )}

          <button type="button" className="ins-popover-item" role="menuitem" onClick={copyLink}>
            <CopyIcon size={16} />
            <span className="ins-popover-item-label">Copy link</span>
          </button>

          <button type="button" className="ins-popover-item" role="menuitem" onClick={() => void downloadAll()}>
            <DownloadIcon size={16} />
            <span className="ins-popover-item-label">Download all screens</span>
            <span className="ins-popover-item-count">{downloadable.length}</span>
          </button>
        </div>
      )}
    </div>
  );
}
