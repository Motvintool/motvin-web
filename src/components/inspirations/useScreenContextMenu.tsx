'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { App, Screen } from '@/lib/inspirations/types';
import { addWatermarkToBlob } from '@/lib/inspirations/watermark';
import { useDownloadGate } from './useDownloadGate';
import { useToast } from './Toast';

const ICON_COPY_PNG = '/ASSET/Icons/Motvin/copy-png.svg';
const ICON_DOWNLOAD_PNG = '/ASSET/Icons/Motvin/download-png.svg';
const ICON_COPY_LINK = '/ASSET/Icons/Motvin/copy-link.svg';

/** Where a screenshot has the menu below (a card, a flow strip's shot, a preview or comparison). */
const SCREENSHOT_SCOPE = '.ins-card-inset, .ins-flows-row-shot, .ins-screen-preview-modal, .ins-compare-modal';
/** How long a finger rests on a screenshot before its menu opens, and how far it may wander. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

/**
 * The screenshot menu on a touch screen. A right-click is a long-press there,
 * but only some browsers say so: Android Chrome fires a contextmenu, iOS
 * Safari never does (it shows its own image callout instead). So a finger
 * resting still on a screenshot for half a second fires one itself, at the
 * finger, which every screenshot's onContextMenu already answers; if the
 * browser fires its own first, that one does instead. The tap that ends a
 * long-press doesn't also open the screenshot. Mounted once, in the shell.
 */
export function LongPressScreenMenus() {
  useEffect(() => {
    if (!window.matchMedia('(hover: none)').matches) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let press: { x: number; y: number; target: Element } | null = null;
    let fired = false;
    let native = false;
    const cancel = () => {
      clearTimeout(timer);
      press = null;
    };
    const onStart = (e: TouchEvent) => {
      cancel();
      fired = false;
      native = false;
      const target = e.target as Element;
      // The flow player's bar has its own long-press (the step preview).
      if (e.touches.length !== 1 || !target.closest?.(SCREENSHOT_SCOPE) || target.closest('.ins-flow-steps')) return;
      const { clientX: x, clientY: y } = e.touches[0];
      press = { x, y, target };
      timer = setTimeout(() => {
        if (!press || native) return;
        fired = true;
        navigator.vibrate?.(10);
        press.target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: press.x, clientY: press.y, view: window }));
      }, LONG_PRESS_MS);
    };
    const onMove = (e: TouchEvent) => {
      if (!press) return;
      const t = e.touches[0];
      if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > LONG_PRESS_SLOP) cancel();
    };
    const onEnd = (e: TouchEvent) => {
      // After a long-press, lifting the finger isn't a tap on the screenshot.
      if (fired && e.cancelable) e.preventDefault();
      cancel();
    };
    const onNative = (e: Event) => {
      if (e.isTrusted && press) native = true;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: false });
    document.addEventListener('touchcancel', cancel);
    document.addEventListener('contextmenu', onNative, true);
    return () => {
      cancel();
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('contextmenu', onNative, true);
    };
  }, []);
  return null;
}

/**
 * The right-click menu for a screenshot — Copy PNG, Download PNG, Copy link —
 * shared by the grid's screen cards (ScreenCard) and the image in the screen
 * preview (ScreenPreviewModal), so both offer the same thing in place of the
 * browser's own "Save image as…". Copying and downloading go through
 * useDownloadGate, so a guest gets the sign-in notice instead.
 *
 * Spread `onContextMenu` on the element that should open it and render `menu`.
 * `link` gives the address Copy link puts on the clipboard.
 */
export function useScreenContextMenu(screen: Screen | null, app: App | null | undefined, link: () => string) {
  const { show } = useToast();
  const { allow } = useDownloadGate();
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Where it's drawn: at the pointer, flipped up / left (8px clear of the
  // edge) when it would run off the bottom or right of the window, as by a
  // right-click near the foot of a dialog.
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!position || !el) {
      setPlaced(null);
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    const x = position.x + width > window.innerWidth - 8 ? Math.max(8, position.x - width) : position.x;
    const y = position.y + height > window.innerHeight - 8 ? Math.max(8, position.y - height) : position.y;
    setPlaced({ x, y });
  }, [position]);

  // Closes on a press anywhere else, a scroll, another right-click or Escape.
  // Listens on the capture phase, so it still hears presses inside dialogs
  // that stop their clicks from bubbling (the screen preview does).
  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      // (A press on the window itself, not a node in it, is a press elsewhere too.)
      if (!(target instanceof Node && menuRef.current?.contains(target))) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Only the menu closes, not the dialog it opened over.
      e.stopPropagation();
      close();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('scroll', close, { capture: true });
    window.addEventListener('contextmenu', close, { capture: true });
    window.addEventListener('keydown', onKey, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('scroll', close, { capture: true });
      window.removeEventListener('contextmenu', close, { capture: true });
      window.removeEventListener('keydown', onKey, { capture: true });
    };
  }, [position]);

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Nothing to offer until the screen has loaded; the browser's menu stays off either way.
      if (screen) setPosition({ x: e.clientX, y: e.clientY });
    },
    [screen],
  );

  // The screenshot with the app's watermark, as the copy and download hand it over.
  const watermarked = useCallback(async () => {
    const src = screen ? inspirationsApi.mediaUrl(screen.url) : null;
    if (!src) throw new Error('No source');
    const blob = await (await fetch(src)).blob();
    return addWatermarkToBlob(blob, app?.name, app ? inspirationsApi.mediaUrl(app.logo) : undefined);
  }, [app, screen]);

  const copyPng = useCallback(
    async (e?: MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setPosition(null);
      // Guests get the sign-in notice instead.
      if (!allow('copy')) return;
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        show('Copying not supported', { tone: 'error' });
        return;
      }
      // Fetching the full screenshot and stamping the watermark takes a
      // moment, so say so straight away instead of looking like nothing
      // happened.
      show('Preparing PNG…', { tone: 'progress' });
      try {
        // The clipboard write starts now, inside the click, and is handed the
        // image once it's ready: browsers (Safari above all) refuse a write
        // that only begins seconds after the click.
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': watermarked() })]);
        show('Copied as PNG');
      } catch (error) {
        console.error('Failed to copy', error);
        show('Failed to copy', { tone: 'error' });
      }
    },
    [allow, show, watermarked],
  );

  const downloadPng = useCallback(
    async (e?: MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      setPosition(null);
      if (!allow()) return;
      show('Preparing download…', { tone: 'progress' });
      try {
        const blobUrl = URL.createObjectURL(await watermarked());
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${screen?.name ?? 'screen'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        show('Downloaded as PNG');
      } catch {
        show('Failed to download', { tone: 'error' });
      }
    },
    [allow, screen, show, watermarked],
  );

  const copyLink = useCallback(
    async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPosition(null);
      try {
        await navigator.clipboard.writeText(link());
        show('Link copied');
      } catch {
        show('Failed to copy link', { tone: 'error' });
      }
    },
    [link, show],
  );

  const menu: ReactNode =
    position && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="ins-context-menu"
            style={{ top: (placed ?? position).y, left: (placed ?? position).x, width: 180, visibility: placed ? undefined : 'hidden' }}
            // Keeps the press inside the menu, so it doesn't reach (and close)
            // the dialog or card underneath.
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div className="ins-context-menu-group">
              <button type="button" className="ins-context-menu-btn" onClick={copyPng}>
                <div className="ins-context-menu-btn-content">
                  <div className="ins-context-menu-icon">
                    <img alt="" src={ICON_COPY_PNG} />
                  </div>
                  <p className="ins-context-menu-text">Copy PNG</p>
                </div>
              </button>
              <button type="button" className="ins-context-menu-btn" onClick={downloadPng}>
                <div className="ins-context-menu-btn-content">
                  <div className="ins-context-menu-icon">
                    <img alt="" src={ICON_DOWNLOAD_PNG} />
                  </div>
                  <p className="ins-context-menu-text">Download PNG</p>
                </div>
              </button>
            </div>
            <div className="ins-context-menu-divider" />
            <button type="button" className="ins-context-menu-btn" onClick={copyLink}>
              <div className="ins-context-menu-btn-content">
                <div className="ins-context-menu-icon">
                  <img alt="" src={ICON_COPY_LINK} />
                </div>
                <p className="ins-context-menu-text">Copy link</p>
              </div>
            </button>
          </div>,
          document.body,
        )
      : null;

  return { onContextMenu, copyPng, downloadPng, menu };
}
