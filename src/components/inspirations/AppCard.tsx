'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { createPortal } from 'react-dom';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Screen } from '@/lib/inspirations/types';
import { addWatermarkToBlob } from '@/lib/inspirations/watermark';
import { AppLogo } from './AppLogo';
import { Screenshot } from './Screenshot';
import { useSiblingCycle } from './useSiblingCycle';
import { useToast } from './Toast';
import { inspirationsApi } from '@/lib/inspirations/api';

const imgSaveRight = "/ASSET/Icons/Motvin/save-right.svg";
const imgDownloadPng = "/ASSET/Icons/Motvin/download-png.svg";
const imgCopyLink = "/ASSET/Icons/Motvin/copy-link.svg";
const imgFrame = "/ASSET/Icons/Motvin/right-arrow-small.svg";

/**
 * App tile — the exact same card as a screen (.ins-card): one of the app's
 * own screenshots inset on the tinted mat, logo + name + tagline below.
 * Hovering cycles the preview through the app's other screens exactly like a
 * screen card does (see useSiblingCycle) — but unlike a screen card, the
 * link always goes to the app page, never to whichever screen is currently
 * previewed, since that's the one thing this card is for.
 *
 * Hovering also reveals a selection ring, top-left (Figma node 1030:40239).
 * Checking it is how you build up the set of apps the float-collection bar
 * (see FloatCollectionBar) saves into a new collection — this replaced the
 * per-card Save/Add-to-collection buttons that used to live here.
 */
export function AppCard({
  app,
  preview,
  previewScreens: presetScreens,
  selected = false,
  selectable = false,
  onToggleSelect,
  onRemove,
}: {
  app: App;
  /** The screen shown before anyone hovers. Defaults to the first of `previewScreens`. */
  preview?: Screen | null;
  /**
   * The carousel, when the caller already has it — the admin's pick for this
   * app (see appCardScreens). Without it the card fetches the app's screens on
   * hover and orders them by `app.cardScreens` when that is set.
   */
  previewScreens?: Screen[] | null;
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: () => void;
  onRemove?: () => void;
}) {
  const href = INSPIRATIONS_ROUTES.app(app);
  const { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step } = useSiblingCycle(
    preview ?? presetScreens?.[0] ?? null,
    { preset: presetScreens, preferredIds: app.cardScreens },
  );

  const { show: showToast } = useToast();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const hideTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!contextMenu) {
      setShowVersions(false);
      return;
    }
    const hideMenu = () => setContextMenu(null);
    window.addEventListener('click', hideMenu);
    window.addEventListener('scroll', hideMenu, { capture: true });
    window.addEventListener('contextmenu', hideMenu, { capture: true });
    return () => {
      window.removeEventListener('click', hideMenu);
      window.removeEventListener('scroll', hideMenu, { capture: true });
      window.removeEventListener('contextmenu', hideMenu, { capture: true });
    };
  }, [contextMenu]);

  const handleMouseEnterVersion = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setShowVersions(true);
  };

  const handleMouseLeaveVersion = () => {
    hideTimeout.current = setTimeout(() => {
      setShowVersions(false);
    }, 150);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleSave = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    if (!selected) {
      onToggleSelect?.();
    }
  };

  const handleDownloadAll = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    try {
      const screensToDownload = previewScreens && previewScreens.length > 0 ? previewScreens : (activeScreen ? [activeScreen] : []);
      
      if (screensToDownload.length === 0) {
        const urlToDownload = app.logo;
        if (!urlToDownload) throw new Error('No media to download');
        const src = inspirationsApi.mediaUrl(urlToDownload);
        if (!src) return;
        const response = await fetch(src);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${app.name}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        return;
      }

      const zip = new JSZip();
      let hasFiles = false;

      for (const s of screensToDownload) {
        const src = inspirationsApi.mediaUrl(s.url);
        if (!src) continue;
        const response = await fetch(src);
        const blob = await response.blob();
        const watermarkedBlob = await addWatermarkToBlob(
          blob, 
          app.name, 
          inspirationsApi.mediaUrl(app.logo)
        );
        zip.file(`${s.name || app.name}-${s.id}.png`, watermarkedBlob);
        hasFiles = true;
      }
      
      if (hasFiles) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const blobUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${app.name}-screens.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      showToast('Failed to download');
    }
  };

  const handleDownloadVersion = async (e: React.MouseEvent, versionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setShowVersions(false);
    try {
      const data = await inspirationsApi.getApp(app.slug);
      if (!data) return;
      const versionScreens = data.screens.filter(s => s.version === versionId);
      
      if (versionScreens.length === 0) {
        showToast('No screens found for this version');
        return;
      }

      const zip = new JSZip();
      let hasFiles = false;

      for (const s of versionScreens) {
        const src = inspirationsApi.mediaUrl(s.url);
        if (!src) continue;
        const response = await fetch(src);
        const blob = await response.blob();
        const watermarkedBlob = await addWatermarkToBlob(
          blob, 
          app.name, 
          inspirationsApi.mediaUrl(app.logo)
        );
        zip.file(`${s.name || app.name}-${s.id}.png`, watermarkedBlob);
        hasFiles = true;
      }
      
      if (hasFiles) {
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const blobUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${app.name}-version-${versionId}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      showToast('Failed to download version screens');
    }
  };

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    try {
      const url = new URL(href, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch (error) {
      showToast('Failed to copy link');
    }
  };

  return (
    <article className="ins-card" data-id={app.id} role="listitem" onMouseEnter={startHover} onMouseLeave={endHover}>
      <div className="ins-card-shot">
        {selectable && (
          <button
            type="button"
            className={`ins-card-select-ring ${selected ? 'is-selected' : ''}`}
            aria-label={selected ? `Remove ${app.name} from selection` : `Select ${app.name}`}
            aria-pressed={selected}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect?.();
            }}
          >
            {selected && <span className="ins-card-select-check" aria-hidden />}
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="ins-card-remove-btn"
            aria-label={`Remove ${app.name}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onRemove();
            }}
          >
            <img src="/ASSET/Icons/Motvin/colletion-delete.svg" alt="" width={16} height={16} />
          </button>
        )}
        <div className="ins-card-inset" onContextMenu={handleContextMenu}>
          <Link href={href} className="ins-card-link" aria-label={app.name}>
            {activeScreen ? <Screenshot screen={activeScreen} /> : <AppLogo app={app} size={96} />}
          </Link>
        </div>
        {dotCount > 1 && (
          <div className="ins-card-hover-controls">
            <button type="button" className="ins-card-control ins-card-control--prev" aria-label="Previous screen" onClick={step(-1)} disabled={activeIndex === 0}>
              <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={24} height={18} />
            </button>
            <span className="ins-card-dots">
              {previewScreens!.map((s, i) => (
                <span key={s.id} className={i === activeIndex ? 'is-active' : ''} />
              ))}
            </span>
            <button type="button" className="ins-card-control" aria-label="Next screen" onClick={step(1)}>
              <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={24} height={18} />
            </button>
          </div>
        )}
      </div>
      <div className="ins-card-meta">
        <AppLogo app={app} size={40} className="ins-card-logo" />
        <div className="ins-card-meta-text">
          <Link href={href} className="ins-card-app">{app.name}</Link>
          {app.tagline && <p className="ins-card-tagline">{app.tagline}</p>}
        </div>
      </div>
      {contextMenu && typeof document !== 'undefined' && createPortal(
        <div 
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 10000, display: 'flex', gap: '8px', alignItems: 'flex-start' }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <div 
            className="ins-context-menu"
            style={{ position: 'relative', top: 'auto', left: 'auto', width: 242, zIndex: 1 }}
          >
            <div className="ins-context-menu-group">
              <div 
                onMouseEnter={handleMouseEnterVersion} 
                onMouseLeave={handleMouseLeaveVersion}
                style={{ width: '100%' }}
              >
                <button type="button" className="ins-context-menu-btn" onClick={handleDownloadAll}>
                  <div className="ins-context-menu-btn-content">
                    <div className="ins-context-menu-icon">
                      <img alt="" src={imgDownloadPng} />
                    </div>
                    <p className="ins-context-menu-text">Download all screens</p>
                  </div>
                  <div className="ins-context-menu-icon-right">
                    <img alt="" src={imgFrame} />
                  </div>
                </button>
              </div>
            <button type="button" className="ins-context-menu-btn" onClick={handleCopyLink}>
              <div className="ins-context-menu-btn-content">
                <div className="ins-context-menu-icon">
                  <img alt="" src={imgCopyLink} />
                </div>
                <p className="ins-context-menu-text">Copy app link</p>
              </div>
            </button>
          </div>
          <div className="ins-context-menu-divider" />
          <button type="button" className="ins-context-menu-btn" onClick={handleSave}>
            <div className="ins-context-menu-btn-content">
              <div className="ins-context-menu-icon">
                <img alt="" src={imgSaveRight} />
              </div>
              <p className="ins-context-menu-text">Save collection</p>
            </div>
          </button>
        </div>

        {showVersions && (
          <div 
            className="ins-context-menu"
            style={{ position: 'relative', top: 'auto', left: 'auto', zIndex: 2 }}
            onMouseEnter={handleMouseEnterVersion}
            onMouseLeave={handleMouseLeaveVersion}
          >
            {app.versions.map(v => (
              <button key={v.id} type="button" className="ins-context-menu-btn" onClick={(e) => handleDownloadVersion(e, v.id)}>
                <p className="ins-context-menu-text" style={{ whiteSpace: 'nowrap' }}>
                  {v.label}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>,
      document.body
    )}
    </article>
  );
}
