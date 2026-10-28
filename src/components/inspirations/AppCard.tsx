'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { createPortal } from 'react-dom';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import type { App, Screen } from '@/lib/inspirations/types';
import { addWatermarkToBlob } from '@/lib/inspirations/watermark';
import { AppLogo } from './AppLogo';
import { CardShots } from './CardShots';
import { Screenshot } from './Screenshot';
import { useSiblingCycle } from './useSiblingCycle';
import { useAsync } from './useAsync';
import { useToast } from './Toast';
import { useDownloadGate } from './useDownloadGate';
import { inspirationsApi } from '@/lib/inspirations/api';
import { CloseIcon } from './Icons';
import { APP_FRESHNESS_LABEL, appFreshness } from '@/lib/inspirations/appFreshness';
import { useLibrarySettings } from './useMeta';

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
  // On the platform the card shows (its preview's): Claude's card in Web Apps opens Claude as a web app.
  const cardPlatform = (preview ?? presetScreens?.[0])?.platform;
  const href = INSPIRATIONS_ROUTES.app(app, cardPlatform);
  const { activeScreen, previewScreens, dotCount, activeIndex, startHover, endHover, step, cardRef, swipe, trackRef, swipeProps } = useSiblingCycle(
    preview ?? presetScreens?.[0] ?? null,
    { preset: presetScreens, preferredIds: app.cardScreens },
  );

  const { show: showToast } = useToast();
  const { allow: allowDownload } = useDownloadGate();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  // The version menu of an app on several platforms lists only this card's platform's versions — read
  // from the app's screens once the menu opens (the same fetch a version download makes).
  const several = app.platforms.length > 1 && Boolean(cardPlatform);
  const { data: versionData } = useAsync(
    () => (showVersions && several ? inspirationsApi.getApp(app.slug) : Promise.resolve(null)),
    `app-card-versions:${app.slug}:${showVersions && several ? cardPlatform : '-'}`,
  );
  const cardVersions = several && versionData ? app.versions.filter((v) => versionData.screens.some((s) => s.version === v.id && s.platform === cardPlatform)) : app.versions;
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
    // Guests get the sign-in notice instead.
    if (!allowDownload()) return;
    try {
      const screensToDownload = previewScreens && previewScreens.length > 0 ? previewScreens : (activeScreen ? [activeScreen] : []);
      
      if (screensToDownload.length === 0) {
        const urlToDownload = app.logo;
        if (!urlToDownload) throw new Error('No media to download');
        const src = inspirationsApi.mediaUrl(urlToDownload);
        if (!src) throw new Error('No media to download');
        const response = await fetch(src);
        if (!response.ok) throw new Error('Failed to download');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${app.name}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        showToast('Downloaded');
        return;
      }

      showToast(`Preparing ${screensToDownload.length} screen${screensToDownload.length === 1 ? '' : 's'}…`, { tone: 'progress' });
      const zip = new JSZip();
      let hasFiles = false;
      let count = 0;

      for (const s of screensToDownload) {
        const src = inspirationsApi.mediaUrl(s.url);
        if (!src) continue;
        const response = await fetch(src);
        if (!response.ok) continue;
        const blob = await response.blob();
        const watermarkedBlob = await addWatermarkToBlob(
          blob, 
          app.name, 
          inspirationsApi.mediaUrl(app.logo)
        );
        zip.file(`${s.name || app.name}-${s.id}.png`, watermarkedBlob);
        hasFiles = true;
        count += 1;
      }
      
      if (!hasFiles) {
        showToast('None of the screens could be fetched', { tone: 'error' });
        return;
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${app.name}-screens.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      showToast(`Downloaded ${count} screen${count === 1 ? '' : 's'}`);
    } catch {
      showToast('Failed to download', { tone: 'error' });
    }
  };

  const handleDownloadVersion = async (e: React.MouseEvent, versionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);
    setShowVersions(false);
    if (!allowDownload()) return;
    try {
      const data = await inspirationsApi.getApp(app.slug);
      if (!data) throw new Error('Failed to download');
      // The card's own platform only: an app on iOS and the web downloads the version it shows.
      const versionScreens = data.screens.filter(s => s.version === versionId && (!cardPlatform || app.platforms.length < 2 || s.platform === cardPlatform));
      
      if (versionScreens.length === 0) {
        showToast('No screens found for this version', { tone: 'error' });
        return;
      }

      showToast(`Preparing ${versionScreens.length} screen${versionScreens.length === 1 ? '' : 's'}…`, { tone: 'progress' });
      const zip = new JSZip();
      let hasFiles = false;
      let count = 0;

      for (const s of versionScreens) {
        const src = inspirationsApi.mediaUrl(s.url);
        if (!src) continue;
        const response = await fetch(src);
        if (!response.ok) continue;
        const blob = await response.blob();
        const watermarkedBlob = await addWatermarkToBlob(
          blob, 
          app.name, 
          inspirationsApi.mediaUrl(app.logo)
        );
        zip.file(`${s.name || app.name}-${s.id}.png`, watermarkedBlob);
        hasFiles = true;
        count += 1;
      }
      
      if (!hasFiles) {
        showToast('None of the screens could be fetched', { tone: 'error' });
        return;
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `${app.name}-version-${versionId}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      showToast(`Downloaded ${count} screen${count === 1 ? '' : 's'}`);
    } catch {
      showToast('Failed to download version screens', { tone: 'error' });
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
    } catch {
      showToast('Failed to copy link', { tone: 'error' });
    }
  };

  // "Latest" or "Updated", from its dated versions and how long the admin's Settings keep each tag.
  // Counted on the card's own platform (an app on iOS and the web isn't "Latest" in iOS for a web upload).
  const freshness = appFreshness(app, useLibrarySettings().freshness, undefined, cardPlatform ? [cardPlatform] : ['ios']);

  return (
    <article ref={cardRef} className="ins-card" data-id={app.id} role="listitem" onMouseEnter={startHover} onMouseLeave={endHover}>
      <div className="ins-card-shot">
        {freshness && (
          <span className={`ins-card-fresh-badge is-${freshness}`} aria-label={`${APP_FRESHNESS_LABEL[freshness]} app`}>
            {APP_FRESHNESS_LABEL[freshness]}
          </span>
        )}
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
            <CloseIcon size={14} />
          </button>
        )}
        <div className="ins-card-inset" onContextMenu={handleContextMenu} {...swipeProps}>
          <Link href={href} className="ins-card-link" aria-label={app.name}>
            {/* On a phone the screens are swiped, side by side; elsewhere the arrows step one at a time. */}
            {swipe && previewScreens && dotCount > 1 ? (
              <CardShots screens={previewScreens} activeIndex={activeIndex} trackRef={trackRef} />
            ) : activeScreen ? (
              <Screenshot screen={activeScreen} />
            ) : (
              <AppLogo app={app} size={96} />
            )}
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
        <AppLogo app={app} size={50} className="ins-card-logo" />
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
            {cardVersions.map(v => (
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
