'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { logoPng } from '@/lib/inspirations/logoPng';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { useDownloadGate } from './useDownloadGate';
import { useToast } from './Toast';

const ICON_COPY_PNG = '/ASSET/Icons/Motvin/copy-png.svg';
const ICON_DOWNLOAD_PNG = '/ASSET/Icons/Motvin/download-png.svg';
const ICON_COPY_LINK = '/ASSET/Icons/Motvin/copy-link.svg';

/** An app logo as the API serves it; the file is named by the app's slug. */
const LOGO_IMAGE = /\/api\/inspirations\/logos\/([^/?#]+)\.\w+/;

/**
 * Right-click on any app logo in Inspirations: our menu — Copy PNG, Download PNG (as the app page's logo
 * view gives them) and Copy link (the app's page) — in place of the browser's "Save image as…". Copying and
 * downloading need an account, as everywhere (useDownloadGate); a guest's click gets the sign-in notice.
 * A logo inside something with its own menu (an app card) keeps that one. In the logo view (the app page's
 * big logo), a right-click anywhere in it is for the logo on show; on its "All logos" grid, a tile's own.
 * Mounted once, in the shell.
 */
export function LogoContextMenu() {
  const { show } = useToast();
  const { allow } = useDownloadGate();
  const [open, setOpen] = useState<{ x: number; y: number; slug: string; src: string } | null>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Bubble phase, after React's handlers: one that opened its own menu has already called preventDefault.
  useEffect(() => {
    const logoOf = (img: Element | null | undefined) => {
      if (!(img instanceof HTMLImageElement)) return null;
      const src = img.currentSrc || img.src;
      const match = LOGO_IMAGE.exec(src);
      return match ? { slug: decodeURIComponent(match[1]), src } : null;
    };
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented || !(e.target instanceof Element)) return;
      const view = e.target.closest('.ins-logo-view');
      // In the logo view, anywhere off a logo: the big one on show (none on the grid, so no browser menu either).
      const logo = logoOf(e.target) ?? (view ? logoOf(view.querySelector('.ins-logo-view-art')) : null);
      if (!logo) {
        if (view) e.preventDefault();
        return;
      }
      e.preventDefault();
      setOpen({ x: e.clientX, y: e.clientY, ...logo });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  // At the pointer, flipped up / left (8px clear of the edge) when it would run off the window.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!open || !el) {
      setPlaced(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const x = open.x + width > window.innerWidth - 8 ? Math.max(8, open.x - width) : open.x;
    const y = open.y + height > window.innerHeight - 8 ? Math.max(8, open.y - height) : open.y;
    setPlaced({ x, y });
  }, [open]);

  // Closes on a press anywhere else, a scroll or Escape (as the screenshot menu).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target instanceof Node && menuRef.current?.contains(e.target))) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('scroll', close, { capture: true });
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [open]);

  // The app's name, for the downloaded file's name; its slug if the list can't be had.
  const appName = useCallback(async (slug: string) => {
    const apps = await inspirationsApi.listApps().catch(() => []);
    return apps.find((a) => a.slug === slug || a.id === slug)?.name ?? slug;
  }, []);

  if (!open || typeof document === 'undefined') return null;
  const { slug, src } = open;

  const copyPng = async () => {
    setOpen(null);
    // Guests get the sign-in notice instead.
    if (!allow('copy', 'logos')) return;
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
      show('Copying not supported', { tone: 'error' });
      return;
    }
    try {
      // The write starts inside the click and is handed the image once it's ready: Safari refuses a write
      // that only begins after the click.
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': logoPng(src) })]);
      show('Logo copied as PNG');
    } catch (error) {
      console.error('Failed to copy', error);
      show('Failed to copy', { tone: 'error' });
    }
  };

  const downloadPng = async () => {
    setOpen(null);
    if (!allow('download', 'logos')) return;
    try {
      const [blob, name] = await Promise.all([logoPng(src), appName(slug)]);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${name} logo.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      show('Logo downloaded');
    } catch {
      show('Failed to download', { tone: 'error' });
    }
  };

  const copyLink = async () => {
    setOpen(null);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${INSPIRATIONS_ROUTES.app({ slug })}`);
      show('Link copied');
    } catch {
      show('Failed to copy link', { tone: 'error' });
    }
  };

  const item = (icon: string, label: string, onClick: () => void) => (
    <button type="button" className="ins-context-menu-btn" onClick={onClick}>
      <div className="ins-context-menu-btn-content">
        <div className="ins-context-menu-icon">
          <img alt="" src={icon} />
        </div>
        <p className="ins-context-menu-text">{label}</p>
      </div>
    </button>
  );

  return createPortal(
    <div
      ref={menuRef}
      className="ins-context-menu"
      style={{ top: (placed ?? open).y, left: (placed ?? open).x, width: 180, visibility: placed ? undefined : 'hidden' }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="ins-context-menu-group">
        {item(ICON_COPY_PNG, 'Copy PNG', copyPng)}
        {item(ICON_DOWNLOAD_PNG, 'Download PNG', downloadPng)}
      </div>
      <div className="ins-context-menu-divider" />
      {item(ICON_COPY_LINK, 'Copy link', copyLink)}
    </div>,
    document.body,
  );
}
