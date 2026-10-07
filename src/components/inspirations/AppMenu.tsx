'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { CopyIcon, DownloadIcon, ExternalIcon, MoreIcon } from './Icons';
import { useToast } from './Toast';

/**
 * The "…" menu on an app's masthead.
 *
 * Deliberately short. Every item here does something real — there is no
 * placeholder row for a feature that does not exist yet, because a menu that
 * lies about what the product can do is worse than a menu with three items.
 *
 * "Download all screens" is supplied by the parent (useDownloadAllScreens), so
 * it shares one in-flight download with the masthead's Download button.
 */
export function AppMenu({ count, busy, onDownloadAll }: { count: number; busy: boolean; onDownloadAll: () => void }) {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
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
        <img src="/ASSET/Icons/Motvin/detail-menu.svg" alt="" width={16} height={16} />
      </button>

      {open && (
        <div className="ins-popover ins-appmenu-panel" role="menu">
          <button type="button" className="ins-popover-item" role="menuitem" onClick={copyLink}>
            <CopyIcon size={16} />
            <span className="ins-popover-item-label">Copy link</span>
          </button>

          <button type="button" className="ins-popover-item" role="menuitem" onClick={() => {
              setOpen(false);
              onDownloadAll();
            }}>
            <DownloadIcon size={16} />
            <span className="ins-popover-item-label">Download all screens</span>
            <span className="ins-popover-item-count">{count}</span>
          </button>
        </div>
      )}
    </div>
  );
}
