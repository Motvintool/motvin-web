'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { focusOnOpen } from '@/lib/inspirations/focusOnOpen';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type App, type Industry, type Platform } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CloseIcon, SearchIcon } from './Icons';
import { useAsync } from './useAsync';
import { useDownloadGate } from './useDownloadGate';
import { useToast } from './Toast';

const ICON_COPY_PNG = '/ASSET/Icons/Motvin/copy-png.svg';
const ICON_DOWNLOAD_PNG = '/ASSET/Icons/Motvin/download-png.svg';
/** How many logos the dock shows; the rest are in the "All logos" grid. */
const DOCK_SIZE = 8;

/** The logo as a PNG at its stored size: the files are WebP, which most design tools won't paste. */
async function logoPng(src: string): Promise<Blob> {
  const bitmap = await createImageBitmap(await (await fetch(src)).blob());
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Encode failed'))), 'image/png'));
}

/**
 * The app page's logo. Clicking it opens the logo large in the screen
 * lightbox's own overlay (ScreenLightbox: dark backdrop, close at the top
 * right, Escape), with Copy PNG and Download PNG under it, and every other
 * app's logo to browse: a dock along the bottom (← / → step through it) and
 * an "All logos" grid. Copying and downloading need an account, as for
 * screens (useDownloadGate); a guest gets the sign-in notice. An app without
 * a logo file shows its initials, not clickable.
 *
 * `open` / `onOpenChange` let the page open the view from elsewhere too (the
 * masthead's "…" menu); without them it keeps its own state.
 */
export function MastheadLogo({
  app,
  open: openProp,
  onOpenChange,
}: {
  app: App;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const src = inspirationsApi.mediaUrl(app.logo);
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  if (!src) return <AppLogo app={app} size={90} className="ins-masthead-logo" />;

  return (
    <>
      <button
        type="button"
        className="ins-logo-trigger"
        aria-label={`View ${app.name} logo`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <AppLogo app={app} size={90} className="ins-masthead-logo" />
        {/* Hover: the logo dims and the "open" icon shows in its middle. */}
        <span className="ins-logo-trigger-hover" aria-hidden>
          <svg width="28" height="28" viewBox="0 0 24 24" fillRule="evenodd" clipRule="evenodd">
            <path d="M11 2.05v2.012A8.001 8.001 0 0 0 12 20a8 8 0 0 0 7.938-7h2.013c-.502 5.053-4.766 9-9.951 9c-5.523 0-10-4.477-10-10c0-5.185 3.947-9.449 9-9.95m9 3.364l-8 8L10.586 12l8-8H14V2h8v8h-2z" fill="currentColor" />
          </svg>
        </span>
        <span className="ins-flow-tip" aria-hidden="true">
          View logo
        </span>
      </button>
      {open && <LogoLightbox app={app} onClose={() => setOpen(false)} />}
    </>
  );
}

function LogoLightbox({ app, onClose }: { app: App; onClose: () => void }) {
  const { show } = useToast();
  const { allow } = useDownloadGate();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const [currentId, setCurrentId] = useState(app.id);
  const [mode, setMode] = useState<'single' | 'grid'>('single');
  const [size, setSize] = useState<{ id: string; w: number; h: number } | null>(null);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const categoryRef = useRef<HTMLDivElement>(null);

  // Every app with a logo file, the page's own app included even before the
  // list arrives (so the view opens at once).
  const { data: apps } = useAsync(() => inspirationsApi.listApps(), 'logo-view-apps');
  // The logos of the section the page is in (iOS apps beside an iOS page, web apps and websites beside a
  // web one), each opening on that platform — the page's app is scoped to its platform already.
  const desktop = app.platforms.some(isDesktopPlatform);
  const inSection = (p: Platform) => isDesktopPlatform(p) === desktop;
  const listed = (apps ?? []).filter((a) => inspirationsApi.mediaUrl(a.logo) && a.platforms.some(inSection));
  const logos = listed.some((a) => a.id === app.id) ? listed : [app, ...listed];
  const index = Math.max(0, logos.findIndex((a) => a.id === currentId));
  const current = logos[index] ?? app;
  const src = inspirationsApi.mediaUrl(current.logo) ?? '';

  // The grid's two filters, together: a category and the search.
  const categories = [...new Set(logos.map((a) => a.industry))]
    .map((value) => ({ value, label: INDUSTRY_LABEL[value as Industry] ?? value, count: logos.filter((a) => a.industry === value).length }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const categoryLabel = categories.find((c) => c.value === category)?.label;
  const q = query.trim().toLowerCase();
  const found = logos.filter((a) => (!category || a.industry === category) && (!q || a.name.toLowerCase().includes(q)));

  // The dock's slice: the shown logo and its neighbours, shifting along as
  // ← / → step past its ends.
  const dockStart = Math.min(Math.max(0, index - Math.floor(DOCK_SIZE / 2) + 1), Math.max(0, logos.length - DOCK_SIZE));
  const dockLogos = logos.slice(dockStart, dockStart + DOCK_SIZE);

  const step = (by: number) => setCurrentId(logos[(index + by + logos.length) % logos.length].id);

  // Escape closes the category menu, then clears the grid's search, then
  // backs out of the grid, then closes; ← / → step through the logos while
  // one is shown large.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (categoryOpen) setCategoryOpen(false);
        else if (mode === 'grid' && query) setQuery('');
        else if (mode === 'grid') setMode('single');
        else onClose();
      } else if (mode === 'single' && logos.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        e.preventDefault();
        step(e.key === 'ArrowRight' ? 1 : -1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [categoryOpen, logos.length, mode, onClose, query, step]);

  // "/" and ⌘K / Ctrl K, the site search's shortcuts: caught here first (the
  // capture phase, before GlobalSearch's own listener) so they don't open
  // that search out of sight behind this view. In the grid they go to its
  // own search instead.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === '/' && document.activeElement !== searchRef.current;
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (!slash && !cmdK) return;
      e.preventDefault();
      e.stopPropagation();
      if (mode === 'grid') searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode]);

  // A press outside the category menu closes it.
  useEffect(() => {
    if (!categoryOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!categoryRef.current?.contains(e.target as Node)) setCategoryOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [categoryOpen]);

  // The grid opens ready to type into its search, scrolled to the logo that
  // was being viewed.
  useEffect(() => {
    if (mode !== 'grid') return;
    searchRef.current?.focus({ preventScroll: true });
    document.querySelector('.ins-logo-grid-item[aria-current="true"]')?.scrollIntoView({ block: 'center' });
  }, [mode]);

  // As ScreenLightbox: the page behind doesn't scroll, and focus goes to
  // Close, then back to the logo afterwards.
  useEffect(() => {
    const restoreFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    focusOnOpen(closeRef.current);
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocus?.focus?.();
    };
  }, []);

  // Keeps the shown logo in view in the dock when there are more than fit.
  useEffect(() => {
    dockRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [currentId, mode, apps]);

  // Copy and download take the logo to act on: the one shown large, or a
  // tile's own from the grid.
  const copyPng = async (a: App) => {
    const logo = inspirationsApi.mediaUrl(a.logo);
    // Guests get the sign-in notice instead.
    if (!allow('copy', 'logos')) return;
    if (!logo) {
      show('This logo isn’t available', { tone: 'error' });
      return;
    }
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      show('Copying not supported', { tone: 'error' });
      return;
    }
    try {
      // The write starts inside the click and is handed the image once it's
      // ready: Safari refuses a write that only begins after the click.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': logoPng(logo) })]);
      show('Logo copied as PNG');
    } catch (error) {
      console.error('Failed to copy', error);
      show('Failed to copy', { tone: 'error' });
    }
  };

  const downloadPng = async (a: App) => {
    const logo = inspirationsApi.mediaUrl(a.logo);
    if (!allow('download', 'logos')) return;
    if (!logo) {
      show('This logo isn’t available', { tone: 'error' });
      return;
    }
    try {
      const blobUrl = URL.createObjectURL(await logoPng(logo));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${a.name} logo.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      show('Logo downloaded');
    } catch {
      show('Failed to download', { tone: 'error' });
    }
  };

  // C copies and D downloads the logo shown large (the keys the buttons show),
  // unless typing or a modifier is held (⌘C stays the browser's copy).
  useEffect(() => {
    if (mode !== 'single') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const key = e.key.toLowerCase();
      if (key !== 'c' && key !== 'd') return;
      e.preventDefault();
      void (key === 'c' ? copyPng(current) : downloadPng(current));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const pick = (id: string) => {
    setCurrentId(id);
    setMode('single');
    setQuery('');
    setCategory(null);
  };

  return createPortal(
    <div className={`ins-portal ins-lightbox ins-logo-view ${mode === 'grid' ? 'is-grid' : ''}`} role="presentation">
      <div className="ins-lightbox-backdrop" onClick={onClose} />
      <div className="ins-lightbox-dialog ins-logo-view-dialog" role="dialog" aria-modal="true" aria-label={mode === 'grid' ? 'All logos' : `${current.name} logo`}>
        <button ref={closeRef} type="button" className="ins-lightbox-close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={18} />
        </button>

        {mode === 'grid' ? (
          <>
            {/* Top left, level with Close at the top right. */}
            <button type="button" className="ins-logo-view-back" onClick={() => setMode('single')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              Back
            </button>
            {/* Search and the category filter, centred between Back and
                Close in the same top bar. */}
            <div className="ins-logo-grid-tools">
              <label className="ins-logo-grid-search">
                <SearchIcon size={18} />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search logos"
                  aria-label="Search logos"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <div ref={categoryRef} className="ins-logo-grid-category">
                <button
                  type="button"
                  className={`ins-logo-grid-category-btn ${category ? 'is-set' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={categoryOpen}
                  aria-label={categoryLabel ? `Category: ${categoryLabel}` : 'Category'}
                  title={categoryLabel ?? 'Category'}
                  onClick={() => setCategoryOpen((o) => !o)}
                >
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
                    <path d="M3.5 6h13M6 10h8M8.5 14h3" />
                  </svg>
                </button>
                {categoryOpen && (
                  <div className="ins-logo-grid-category-menu" role="listbox" aria-label="Category">
                    {[{ value: null, label: 'All categories', count: logos.length }, ...categories].map((c) => (
                      <button
                        key={c.value ?? 'all'}
                        type="button"
                        role="option"
                        aria-selected={category === c.value}
                        className="ins-logo-grid-category-item"
                        onClick={() => {
                          setCategory(c.value);
                          setCategoryOpen(false);
                        }}
                      >
                        <span>{c.label}</span>
                        <span className="ins-logo-grid-category-count">{c.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="ins-logo-grid-head">
              <h2 className="ins-logo-grid-title">
                {categoryLabel ?? 'All logos'} <span>{apps ? found.length : ''}</span>
              </h2>
              {(category || q) && (
                <button
                  type="button"
                  className="ins-logo-grid-clear"
                  onClick={() => {
                    setCategory(null);
                    setQuery('');
                  }}
                >
                  <CloseIcon size={14} />
                  Clear
                </button>
              )}
            </div>
            {/* Scrolls on its own under the title, its top and bottom edges
                faded so logos slip away under them rather than being cut. */}
            <div
              className="ins-logo-grid-scroll"
              // The top fade only once something has scrolled up under it.
              onScroll={(e) => e.currentTarget.classList.toggle('is-scrolled', e.currentTarget.scrollTop > 2)}
            >
            {apps && found.length === 0 && (
              <p className="ins-logo-grid-empty">{q ? `No logos match “${query.trim()}”` : 'No logos in this category'}</p>
            )}
            {apps ? (
              <ul className="ins-logo-grid">
                {found.map((a) => (
                  <li key={a.id} className="ins-logo-grid-cell">
                    <button type="button" className="ins-logo-grid-item" aria-current={a.id === current.id} onClick={() => pick(a.id)}>
                      <span className="ins-logo-grid-art">
                        <img src={inspirationsApi.mediaUrl(a.logo) ?? ''} alt="" loading="lazy" />
                      </span>
                      <span className="ins-logo-grid-name">{a.name}</span>
                    </button>
                    {/* Copy / download straight from the tile, on hover (or
                        keyboard focus) at the logo's top right corner. */}
                    <span className="ins-logo-grid-actions">
                      <button type="button" aria-label={`Copy ${a.name} logo as PNG`} title="Copy PNG" onClick={() => copyPng(a)}>
                        <img src={ICON_COPY_PNG} alt="" width={14} height={14} />
                      </button>
                      <button type="button" aria-label={`Download ${a.name} logo as PNG`} title="Download PNG" onClick={() => downloadPng(a)}>
                        <img src={ICON_DOWNLOAD_PNG} alt="" width={14} height={14} />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              // Loading: the tiles' own boxes (logo and name line), so nothing moves when they land.
              <ul className="ins-logo-grid" aria-busy="true" aria-label="Loading logos">
                {Array.from({ length: 20 }, (_, i) => (
                  <li key={i} className="ins-logo-grid-cell" aria-hidden>
                    <span className="ins-logo-grid-item">
                      <span className="ins-logo-grid-art ins-logo-grid-skel" />
                      <span className="ins-logo-grid-name ins-logo-grid-skel-name" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            </div>
          </>
        ) : (
          <>
            {/* The logo over a soft glow of itself (a blurred copy), so each
                brand tints its own light; keyed so a new logo settles in. */}
            <div key={current.id} className="ins-logo-view-figure">
              <img className="ins-logo-view-glow" src={src} alt="" aria-hidden />
              <img
                className="ins-logo-view-art"
                src={src}
                alt={`${current.name} logo`}
                onLoad={(e) => setSize({ id: current.id, w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
            </div>

            <p className="ins-logo-view-meta">
              <strong>{current.name}</strong>
              {size?.id === current.id && <span className="ins-logo-view-chip">{size.w} × {size.h} · PNG</span>}
              {current.slug !== app.slug && (
                <Link href={INSPIRATIONS_ROUTES.app(current, current.platforms.find(inSection))} className="ins-logo-view-open">
                  Open page
                </Link>
              )}
            </p>

            {/* Download leads (solid); Copy beside it in the overlay's glass.
                Each shows its key. */}
            <div className="ins-logo-view-actions">
              <button type="button" className="ins-logo-view-btn" aria-keyshortcuts="C" onClick={() => copyPng(current)}>
                <img src={ICON_COPY_PNG} alt="" width={16} height={16} />
                Copy PNG
                <kbd className="ins-logo-view-kbd" aria-hidden>C</kbd>
              </button>
              <button type="button" className="ins-logo-view-btn ins-logo-view-btn--primary" aria-keyshortcuts="D" onClick={() => downloadPng(current)}>
                <img src={ICON_DOWNLOAD_PNG} alt="" width={16} height={16} />
                Download PNG
                <kbd className="ins-logo-view-kbd" aria-hidden>D</kbd>
              </button>
            </div>
          </>
        )}
      </div>

      {/* The dock: every logo in a frosted strip along the bottom, the shown
          one marked by a dot, then the way into the full grid. */}
      {mode === 'single' && logos.length > 1 && (
        <nav className="ins-logo-dock" aria-label="App logos">
          <div ref={dockRef} className="ins-logo-dock-track">
            {dockLogos.map((a) => (
              <button
                key={a.id}
                type="button"
                className="ins-logo-dock-item"
                aria-label={a.name}
                aria-current={a.id === current.id}
                title={a.name}
                onClick={() => setCurrentId(a.id)}
              >
                <img src={inspirationsApi.mediaUrl(a.logo) ?? ''} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <span className="ins-logo-dock-divider" aria-hidden />
          <button type="button" className="ins-logo-dock-all" onClick={() => setMode('grid')} aria-label={`All logos (${logos.length})`} title="All logos">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="2" />
              <rect x="11" y="2.5" width="6.5" height="6.5" rx="2" />
              <rect x="2.5" y="11" width="6.5" height="6.5" rx="2" />
              <rect x="11" y="11" width="6.5" height="6.5" rx="2" />
            </svg>
          </button>
        </nav>
      )}
    </div>,
    document.body,
  );
}
