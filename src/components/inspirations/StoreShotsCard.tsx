'use client';

import JSZip from 'jszip';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { storeAction } from '@/lib/inspirations/storeAction';
import { INDUSTRY_LABEL, PLATFORM_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Platform, Screen, StoreShotSet } from '@/lib/inspirations/types';
import { addWatermarkToBlob } from '@/lib/inspirations/watermark';
import { AppLogo } from './AppLogo';
import { CloseIcon } from './Icons';
import { ExpandButton, useExpandedPreview } from './PreviewExpand';
import { SaveButton } from './SaveButton';
import { splitAppName } from './ScreenCard';
import { ScreenLightbox } from './ScreenLightbox';
import { StoreLinkButton } from './StoreMenuItem';
import { useToast } from './Toast';
import { useDownloadGate } from './useDownloadGate';
import { useScreenContextMenu } from './useScreenContextMenu';
import { SHEET_QUERY, useMediaQuery, useSheet } from './useSheet';
import { useSwipeStep } from './useSwipeStep';

/**
 * The app page's "Screenshots" card, right after the prototype: the first
 * three store screenshots fanned out like cards in a hand (they spread wider
 * on hover), and a click opens the whole set in order. Its own kind of card,
 * so it never reads as one of the app's screens.
 *
 * The open set lives in the URL (`?shots=<n>`, the image on show — or, where
 * several sets share a page as in a collection, `?shots=<app>@<platform>:<n>`),
 * so a reload keeps it open and Back closes it. Copy link always hands over the
 * image on the app's own page.
 */

export const SHOTS_PARAM = 'shots';

/** The id a store screenshot set is saved under: always with its platform, as sets never mix platforms. */
export const storeShotsItemId = (appId: string, platform: Platform) => `${appId}@${platform}`;

/**
 * One store image in the shape of a Screen, so the screen preview's own full-size view (ScreenLightbox) and
 * right-click menu (Copy PNG, Download PNG, Copy link) handle it exactly as they do a screen.
 */
function asScreen(app: App, platform: Platform, set: StoreShotSet, index: number): Screen {
  const image = set.images[index];
  return {
    id: `${app.id}-${platform}-store-${index + 1}`,
    appId: app.id,
    name: `${app.name} App Store screenshot ${index + 1}`,
    file: image.file,
    url: image.url,
    width: image.width,
    height: image.height,
    bytes: 0,
    platform,
    screenType: 'other',
    fineType: '',
    states: [],
    description: '',
    capture: null,
    industry: app.industry,
    tags: [],
    elements: [],
    style: [],
    capturedAt: set.date,
    version: set.date,
    hasAnalysis: false,
    downloadable: Boolean(set.downloadable),
    source: {} as Screen['source'],
  };
}

function subscribeNever() {
  return () => {};
}

type StoreImage = StoreShotSet['images'][number];

export function StoreShotsCard({
  set,
  app,
  platform,
  downloadable = false,
  keyed = false,
  showApp = false,
  onRemove,
}: {
  set: StoreShotSet;
  app: App;
  platform: Platform;
  /** The page's own answer, for a backend that predates the set's `downloadable`. */
  downloadable?: boolean;
  /** Several sets on one page (a collection): its link names this set as well as the image. */
  keyed?: boolean;
  /** A page of many apps' sets: the app's logo and name under the card, as a screen card has them. */
  showApp?: boolean;
  /** In a collection: takes it out (a × like a saved app's). */
  onRemove?: () => void;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const count = set.images.length;
  const prefix = keyed ? `${storeShotsItemId(app.id, platform)}:` : '';
  const asked = params.get(SHOTS_PARAM);
  const askedIndex = asked !== null && asked.startsWith(prefix) && /^\d+$/.test(asked.slice(prefix.length)) ? Number(asked.slice(prefix.length)) : null;
  const openAt = askedIndex === null ? null : Math.min(count, Math.max(1, askedIndex)) - 1;
  const canDownload = set.downloadable ?? downloadable;
  // Right-click on the card: the screen menu, for the set's first image.
  const cardMenu = useScreenContextMenu(asScreen(app, platform, set, 0), app, () => linkFor(0));
  // The first image on top, the next two behind it to the left and right.
  const fan = set.images.slice(0, 3);
  const order = [fan[1], fan[2], fan[0]].filter(Boolean);
  const named = splitAppName(app.name);
  const sourceLine = set.source === 'appstore' ? 'App Store screenshots' : 'Store screenshots';

  // Copy link always names the image on the app's own page: a collection lives in its owner's browser only, so
  // a link into one would open nothing for anyone else. The platform goes along, as the page opens iOS first.
  function linkFor(index: number) {
    const sp = new URLSearchParams({ platform, [SHOTS_PARAM]: String(index + 1) });
    return `${window.location.origin}/inspirations/app/${app.slug}?${sp.toString()}`;
  }

  // As the screen preview does: opening adds a history entry, so Back closes it; closing goes back when it was
  // opened here, and only drops the param for one that arrived open from a link.
  const openedHere = useRef(false);
  const go = useCallback(
    (index: number | null) => {
      if (index === null && openedHere.current) {
        openedHere.current = false;
        router.back();
        return;
      }
      const sp = new URLSearchParams(params.toString());
      if (index === null) sp.delete(SHOTS_PARAM);
      else sp.set(SHOTS_PARAM, `${prefix}${index + 1}`);
      const query = sp.toString();
      const href = query ? `${pathname}?${query}` : pathname;
      if (index === null) router.replace(href, { scroll: false });
      else {
        openedHere.current = true;
        router.push(href, { scroll: false });
      }
    },
    [params, pathname, prefix, router],
  );

  return (
    <article className="ins-card ins-store-card" role="listitem">
      <button
        type="button"
        className="ins-card-shot ins-store-card-shot"
        aria-label={`${sourceLine} of ${app.name}: ${count} image${count === 1 ? '' : 's'}`}
        aria-haspopup="dialog"
        onClick={() => go(0)}
        onContextMenu={cardMenu.onContextMenu}
      >
        <span className="ins-store-card-badge" aria-hidden>
          Screenshots
        </span>
        <span className={`ins-store-fan is-${order.length}`} aria-hidden>
          {/* Each image moves inside its own span: the site's theme switches transitions off on every <img>. */}
          {order.map((image) => (
            <span key={image.file} className="ins-store-fan-card" style={{ aspectRatio: `${image.width} / ${image.height}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={inspirationsApi.mediaUrl(image.url) ?? undefined} alt="" loading="lazy" decoding="async" />
            </span>
          ))}
        </span>
        <span className="ins-store-card-cap" aria-hidden>
          {/* The short name where the card is narrow (a phone), so the caption stays one line under the fan. */}
          <span className="ins-store-card-title">{sourceLine}</span>
          <span className="ins-store-card-title is-short">{set.source === 'appstore' ? 'App Store' : 'Screenshots'}</span>
          <span className="ins-store-card-sub">
            <span>
              {count} image{count === 1 ? '' : 's'}
            </span>
            <span className="ins-store-card-cta">
              View all
              {/* The "View in App Store" menu item's arrow (view-apps.svg), drawn in the pill's white. */}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M13.9502 2.5498V13.7373H12.0264V5.82812L11.9404 5.91406L3.4248 14.4287L2.07031 13.0742L10.5859 4.55957L10.6719 4.47363H2.7627V2.5498H13.9502Z" />
              </svg>
            </span>
          </span>
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          className="ins-card-remove-btn"
          aria-label={`Remove ${app.name}'s screenshots`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          <CloseIcon size={14} />
        </button>
      )}
      {showApp && (
        <div className="ins-card-meta">
          <AppLogo app={app} size={48} className="ins-card-logo" />
          <div className="ins-card-meta-text">
            <Link href={INSPIRATIONS_ROUTES.app(app, platform)} className="ins-card-app">
              {named.title}
            </Link>
            {(app.tagline || named.tagline) && <p className="ins-card-tagline">{app.tagline || named.tagline}</p>}
          </div>
        </div>
      )}
      {cardMenu.menu}
      {openAt !== null && (
        <StoreShotsModal
          set={set}
          app={app}
          platform={platform}
          downloadable={canDownload}
          start={openAt}
          onIndex={(index) => {
            // The address follows the image on show (replaced, not pushed: stepping isn't history), so a reload keeps it.
            const sp = new URLSearchParams(params.toString());
            sp.set(SHOTS_PARAM, `${prefix}${index + 1}`);
            router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
          }}
          linkFor={linkFor}
          onClose={() => go(null)}
        />
      )}
    </article>
  );
}

/**
 * The set opened in the screen preview's own frame (ScreenPreviewModal's
 * classes): the app and "App Store screenshots" in the header, one image at a
 * time with the arrows (or ← →), or every one in a row with "All screenshots",
 * and the tags, Save (this set, to a collection's Screenshots), the store link
 * and More (Copy PNG, Download all — one zip — and Copy link) at the foot. A
 * click on an image opens the screen preview's own full-size view, and a
 * right-click anywhere its menu (Copy PNG, Download PNG, Copy link) — the very
 * ones screens use. Copies and downloads carry the app's watermark and follow
 * the screens' rules: signed in, and Download all only where the app's licence
 * allows (`downloadable`). Closes on Escape, × or a click outside; a sheet from
 * the bottom on a phone.
 */
const KEYS: Array<[string[], string]> = [
  [['←', '→'], 'Previous / next screenshot'],
  [['A'], 'All screenshots / one at a time'],
  [['S'], 'Save'],
  [['C'], 'Copy PNG'],
  [['D'], 'Download all'],
  [['L'], 'Copy link'],
  [['?'], 'Show these shortcuts'],
  [['Esc'], 'Close'],
];

function StoreShotsModal({
  set,
  app,
  platform,
  downloadable,
  start,
  onIndex,
  linkFor,
  onClose,
}: {
  set: StoreShotSet;
  app: App;
  platform: Platform;
  downloadable: boolean;
  start: number;
  onIndex: (index: number) => void;
  linkFor: (index: number) => string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const firstIndex = useRef(true);
  useEffect(() => {
    if (firstIndex.current) {
      firstIndex.current = false;
      return;
    }
    onIndex(index);
    // Only on a step: onIndex is a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);
  const [all, setAll] = useState(false);
  const [zoom, setZoom] = useState<number | null>(null);
  // The image a right-click picked (one of the row, with All screenshots), else the one on show.
  const [menuIndex, setMenuIndex] = useState<number | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const { show } = useToast();
  const { allow } = useDownloadGate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const expanded = useExpandedPreview();
  const { ref: sheetRef, className: sheetClass, dragProps: sheetDrag, handle: sheetHandle } = useSheet(onClose);
  const count = set.images.length;
  const store = storeAction(platform, app.website);
  const title = set.source === 'appstore' ? 'App Store screenshots' : 'Store screenshots';
  const menuAt = menuIndex ?? index;
  // Right-click: the screen menu (Copy PNG, Download PNG, Copy link), the very one screens use.
  const shotMenu = useScreenContextMenu(asScreen(app, platform, set, menuAt), app, () => linkFor(menuAt));
  const onShotContextMenu = (i: number) => (e: MouseEvent) => {
    setMenuIndex(i);
    shotMenu.onContextMenu(e);
  };

  // The image with the app's watermark, as the screens' copy and download hand theirs over.
  const watermarked = useCallback(
    async (i: number) => {
      const src = inspirationsApi.mediaUrl(set.images[i].url);
      if (!src) throw new Error('No source');
      const blob = await (await fetch(src)).blob();
      return addWatermarkToBlob(blob, app.name, inspirationsApi.mediaUrl(app.logo));
    },
    [app, set.images],
  );

  const copyPng = useCallback(async () => {
    setMoreOpen(false);
    if (!allow('copy')) return;
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      show('Copying not supported', { tone: 'error' });
      return;
    }
    show('Preparing PNG…', { tone: 'progress' });
    try {
      // Started inside the click and handed the image when ready: Safari refuses a write begun seconds later.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': watermarked(index) })]);
      show('Copied as PNG');
    } catch {
      show('Failed to copy', { tone: 'error' });
    }
  }, [allow, index, show, watermarked]);

  // Every image, watermarked side by side, in one zip: one file to save, not a burst the browser may block.
  const downloadAll = useCallback(async () => {
    setMoreOpen(false);
    if (!downloadable || !allow()) return;
    show(`Preparing ${count} screenshots…`, { tone: 'progress' });
    try {
      const zip = new JSZip();
      const blobs = await Promise.all(set.images.map((_, i) => watermarked(i)));
      blobs.forEach((blob, i) => zip.file(`${app.slug}-app-store-${i + 1}.png`, blob));
      // Made here, not linked: on the API's origin the browser ignores `download` and opens the file instead.
      const url = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${app.slug}-app-store-screenshots.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      show(`Downloaded ${count} screenshots`);
    } catch {
      show('Failed to download', { tone: 'error' });
    }
  }, [allow, app.slug, count, downloadable, set.images, show, watermarked]);

  const copyLink = useCallback(async () => {
    setMoreOpen(false);
    try {
      await navigator.clipboard.writeText(linkFor(index));
      show('Link copied');
    } catch {
      show('Copy not available', { tone: 'error' });
    }
  }, [index, linkFor, show]);

  const step = useCallback(
    (by: number) => {
      if (all) {
        const film = filmRef.current;
        const shot = film?.firstElementChild as HTMLElement | null;
        film?.scrollBy({ left: by * ((shot?.offsetWidth ?? 300) + 24), behavior: 'smooth' });
        return;
      }
      setIndex((i) => Math.min(count - 1, Math.max(0, i + by)));
    },
    [all, count],
  );

  // A phone, as the screen preview: a swipe steps through the images (no arrows there), the header is short, and
  // the footer is one row — All screenshots moves into More.
  const phone = useMediaQuery(SHEET_QUERY);
  const { moverRef, swipeProps } = useSwipeStep({
    canPrev: index > 0,
    canNext: index < count - 1,
    onStep: (dir) => setIndex((i) => Math.min(count - 1, Math.max(0, i + dir))),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The full-size view on top handles its own keys.
      if (zoom !== null || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable]')) return;
      // A collection picker or the right-click menu open has the keys to itself.
      if (document.querySelector('.ins-float-collection-bar, .ins-context-menu')) return;
      const key = e.key.toLowerCase();
      if (key === 'escape') {
        e.preventDefault();
        if (showKeys || moreOpen) {
          setShowKeys(false);
          setMoreOpen(false);
        } else onClose();
      } else if (key === 'arrowleft') step(-1);
      else if (key === 'arrowright') step(1);
      else if (key === 'a' && count > 1) setAll((v) => !v);
      else if (key === 's') saveRef.current?.click();
      else if (key === 'c') void copyPng();
      else if (key === 'd' && downloadable) void downloadAll();
      else if (key === 'l') void copyLink();
      else if (key === '?') setShowKeys((v) => !v);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [copyLink, copyPng, count, downloadAll, downloadable, moreOpen, onClose, showKeys, step, zoom]);

  useEffect(() => {
    const restore = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restore?.focus?.();
    };
  }, []);

  if (!mounted) return null;
  const shot = (image: StoreImage, i: number, mover?: typeof moverRef) => (
    <div
      key={image.file}
      ref={mover}
      className={`ins-screen-preview-shot ins-screen-preview-shot--store ${image.width > image.height ? 'is-wide' : ''}`}
      style={{ aspectRatio: `${image.width} / ${image.height}` }}
      onClick={() => {
        setIndex(i);
        setZoom(i);
      }}
      onContextMenu={onShotContextMenu(i)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={inspirationsApi.mediaUrl(image.url) ?? undefined} alt={`${app.name} store screenshot ${i + 1}`} decoding="async" />
    </div>
  );

  // The footer's More menu; on a phone it sits in the one row and holds All screenshots too.
  const moreMenu = (
    <div className="ins-popwrap">
      <button
        type="button"
        className="ins-screen-preview-foot-more"
        aria-label="More actions"
        aria-expanded={moreOpen}
        aria-haspopup="menu"
        onClick={() => {
          setShowKeys(false);
          setMoreOpen((o) => !o);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ASSET/Icons/Motvin/detail-menu.svg" alt="" width={16} height={16} />
      </button>
      {moreOpen && (
        // The images (copy, download), then the link, split by a divider as the screen preview's menu is.
        <div className="ins-popover ins-popover--right" role="menu" onMouseLeave={() => setMoreOpen(false)}>
          {phone && count > 1 && (
            <>
              <button
                type="button"
                className="ins-popover-item"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  setAll((v) => !v);
                }}
              >
                <MenuIcon src={all ? '/ASSET/Icons/Motvin/indiviudal-screen.svg' : '/ASSET/Icons/Motvin/show-all-screens.svg'} /> <span>{all ? 'One at a time' : 'All screenshots'}</span>
              </button>
              <div className="ins-popover-divider" role="separator" />
            </>
          )}
          <button type="button" className="ins-popover-item" role="menuitem" onClick={() => void copyPng()}>
            <MenuIcon src="/ASSET/Icons/Motvin/copy-png.svg" /> <span>Copy PNG</span>
          </button>
          {downloadable && (
            <button type="button" className="ins-popover-item" role="menuitem" onClick={() => void downloadAll()}>
              <MenuIcon src="/ASSET/Icons/Motvin/download-png.svg" /> <span>Download all</span>
            </button>
          )}
          <div className="ins-popover-divider" role="separator" />
          <button type="button" className="ins-popover-item" role="menuitem" onClick={() => void copyLink()}>
            <MenuIcon src="/ASSET/Icons/Motvin/copy-link.svg" /> <span>Copy link</span>
          </button>
        </div>
      )}
    </div>
  );

  return createPortal(
    <>
      {/* Right-click anywhere in the preview: the screen menu for the image on show, never the browser's. */}
      <div className="ins-search-overlay ins-sheet-overlay" role="presentation" onClick={onClose} onContextMenu={onShotContextMenu(index)}>
        <div
          ref={sheetRef}
          className={`ins-screen-preview-modal ins-store-preview ins-sheet--tall ${sheetClass} is-details-hidden ${expanded ? 'is-full' : ''}`}
          {...sheetDrag}
          role="dialog"
          aria-modal="true"
          aria-label={`${app.name} / ${title}`}
          onClick={(e) => e.stopPropagation()}
        >
          {sheetHandle}
          <button type="button" className="ins-screen-preview-corner-close" aria-label="Close" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
          <div className="ins-screen-preview-main">
            <div className="ins-screen-preview-head">
              <div className="ins-screen-preview-head-app">
                <AppLogo app={app} size={40} className="ins-screen-preview-head-logo" />
                <div className="ins-screen-preview-head-title">
                  <span>{app.name}</span>
                  <span className="ins-screen-preview-head-sep">/</span>
                  <span>{phone ? 'Screenshots' : title}</span>
                  {!all && (
                    <>
                      <span className="ins-screen-preview-head-sep ins-flow-head-step-sep">/</span>
                      <span className="ins-flow-head-step">
                        {index + 1} of {count}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="ins-flow-head-actions">
                <ExpandButton />
                <button
                  type="button"
                  className="ins-flow-present-open"
                  aria-label="Keyboard shortcuts"
                  aria-expanded={showKeys}
                  onClick={() => {
                    setMoreOpen(false);
                    setShowKeys((v) => !v);
                  }}
                >
                  <span className="ins-preview-keys-icon" aria-hidden="true">
                    ?
                  </span>
                  <span>Shortcuts</span>
                </button>
                <button ref={closeRef} type="button" className="ins-screen-preview-close" aria-label="Close" onClick={onClose}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/ASSET/Icons/Motvin/screen-preview-modal-close.svg" alt="" width={16} height={16} />
                </button>
              </div>
            </div>

            {showKeys && (
              <div className="ins-preview-keys" role="dialog" aria-label="Keyboard shortcuts" onClick={() => setShowKeys(false)}>
                <p className="ins-preview-keys-title">Keyboard shortcuts</p>
                <dl>
                  {KEYS.filter(([keys]) => (downloadable || keys[0] !== 'D') && (count > 1 || keys[0] !== 'A')).map(([keys, label]) => (
                    <div key={label} className="ins-preview-keys-row">
                      <dt>
                        {keys.map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </dt>
                      <dd>{label}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <div className="ins-screen-preview-filmstrip-wrap">
              {all ? (
                <div className="ins-screen-preview-filmstrip" ref={filmRef}>
                  {set.images.map((image, i) => shot(image, i))}
                </div>
              ) : (
                <div className="ins-screen-preview-filmstrip ins-screen-preview-filmstrip--single" {...swipeProps}>
                  {shot(set.images[index], index, moverRef)}
                </div>
              )}
              {count > 1 && (
                <>
                  <button
                    type="button"
                    className="ins-card-control ins-card-control--prev ins-screen-preview-nav ins-screen-preview-nav--prev"
                    aria-label="Previous screenshot"
                    onClick={() => step(-1)}
                    disabled={!all && index === 0}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ASSET/Icons/Motvin/previous-arrow.svg" alt="" width={24} height={18} />
                  </button>
                  <button
                    type="button"
                    className="ins-card-control ins-screen-preview-nav ins-screen-preview-nav--next"
                    aria-label="Next screenshot"
                    onClick={() => step(1)}
                    disabled={!all && index === count - 1}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ASSET/Icons/Motvin/next-arrow.svg" alt="" width={24} height={18} />
                  </button>
                </>
              )}
            </div>

            <div className="ins-screen-preview-foot">
              <div className="ins-screen-preview-foot-tags">
                <span className="ins-screen-preview-foot-tag">{INDUSTRY_LABEL[app.industry]}</span>
                <span className="ins-screen-preview-foot-tag">{PLATFORM_LABEL[platform]}</span>
                {!phone && <span className="ins-screen-preview-foot-tag">{set.label}</span>}
              </div>
              <div className="ins-screen-preview-foot-primary">
                <SaveButton ref={saveRef} type="storeShots" id={storeShotsItemId(app.id, platform)} variant="button" app={app} className="ins-screen-preview-foot-btn ins-screen-preview-foot-btn--save" />
                {store && <StoreLinkButton name={app.name} platform={platform} action={store} className="ins-screen-preview-foot-btn" />}
                {phone && moreMenu}
              </div>
              {!phone && (
                <div className="ins-screen-preview-foot-secondary">
                  {count > 1 && (
                    <button type="button" className="ins-screen-preview-foot-btn" aria-pressed={all} onClick={() => setAll((v) => !v)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={all ? '/ASSET/Icons/Motvin/indiviudal-screen.svg' : '/ASSET/Icons/Motvin/show-all-screens.svg'} alt="" width={20} height={20} />
                      {all ? 'One at a time' : 'All screenshots'}
                    </button>
                  )}
                  {moreMenu}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Beside the overlay, not in it: a click in the full-size view must not reach the overlay's close. */}
      {zoom !== null && <ScreenLightbox screen={asScreen(app, platform, set, zoom)} app={app} link={() => linkFor(zoom)} onClose={() => setZoom(null)} />}
      {shotMenu.menu}
    </>,
    document.body,
  );
}

function MenuIcon({ src }: { src: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" width={16} height={16} aria-hidden />;
}
