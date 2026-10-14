'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { AppVersion } from '@/lib/inspirations/types';
import { useToast } from './Toast';

/**
 * The "…" menu on an app's masthead: the same menu, look and items as an app
 * card's right-click menu (AppCard) — Download all screens (with a submenu of
 * the app's dated versions) and Copy app link. Saving lives on the masthead's
 * own Save button, so it isn't repeated here.
 *
 * The downloads are supplied by the parent (useDownloadAllScreens), so they
 * share one in-flight download with the rest of the masthead.
 */

const ICON_DOWNLOAD = '/ASSET/Icons/Motvin/download-png.svg';
const ICON_LINK = '/ASSET/Icons/Motvin/copy-link.svg';
const ICON_MORE = '/ASSET/Icons/Motvin/right-arrow-small.svg';

/** How long the versions submenu waits before closing once the pointer leaves it. */
const SUBMENU_CLOSE_MS = 150;

export function AppMenu({
  busy,
  versions,
  onDownloadAll,
  onDownloadVersion,
}: {
  busy: boolean;
  versions: AppVersion[];
  onDownloadAll: () => void;
  onDownloadVersion: (versionId: string) => void;
}) {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Like the card's menu: the › and its submenu of dated captures show for any app that has one.
  const hasVersions = versions.length > 0;

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

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const close = () => {
    setOpen(false);
    setShowVersions(false);
  };

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    setShowVersions(false);
    setOpen((o) => !o);
  };

  const keepVersions = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (hasVersions) setShowVersions(true);
  };

  const dropVersions = () => {
    hideTimer.current = setTimeout(() => setShowVersions(false), SUBMENU_CLOSE_MS);
  };

  const copyLink = async () => {
    close();
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
        // The menu hangs from the button's right edge; the versions submenu
        // opens beside it on the left, since the button sits at the page's edge.
        <div className="ins-appmenu-layer">
          <div className="ins-context-menu ins-appmenu-panel" role="menu">
            <div className="ins-context-menu-group">
              <div className="ins-appmenu-row" onMouseEnter={keepVersions} onMouseLeave={dropVersions}>
                <button
                  type="button"
                  className="ins-context-menu-btn"
                  role="menuitem"
                  aria-haspopup={hasVersions ? 'menu' : undefined}
                  aria-expanded={hasVersions ? showVersions : undefined}
                  onClick={() => {
                    close();
                    onDownloadAll();
                  }}
                >
                  <div className="ins-context-menu-btn-content">
                    <div className="ins-context-menu-icon">
                      <img alt="" src={ICON_DOWNLOAD} />
                    </div>
                    <p className="ins-context-menu-text">Download all screens</p>
                  </div>
                  {hasVersions && (
                    <div className="ins-context-menu-icon-right">
                      <img alt="" src={ICON_MORE} />
                    </div>
                  )}
                </button>
              </div>
              <button type="button" className="ins-context-menu-btn" role="menuitem" onClick={copyLink}>
                <div className="ins-context-menu-btn-content">
                  <div className="ins-context-menu-icon">
                    <img alt="" src={ICON_LINK} />
                  </div>
                  <p className="ins-context-menu-text">Copy app link</p>
                </div>
              </button>
            </div>
          </div>

          {showVersions && (
            <div
              className="ins-context-menu ins-appmenu-versions"
              role="menu"
              aria-label="Download a version"
              onMouseEnter={keepVersions}
              onMouseLeave={dropVersions}
            >
              {versions.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="ins-context-menu-btn"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onDownloadVersion(v.id);
                  }}
                >
                  <p className="ins-context-menu-text" style={{ whiteSpace: 'nowrap' }}>
                    {v.isLatest ? `${v.label} · Latest` : v.label}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
