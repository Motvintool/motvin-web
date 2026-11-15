'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';

/** Where a modal turns into a sheet (as .ins-sheet in the stylesheet). */
export const SHEET_QUERY = '(max-width: 759px)';

/** Whether a media query matches now, following it as the window changes (false on the server). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const list = window.matchMedia(query);
        list.addEventListener('change', onChange);
        return () => list.removeEventListener('change', onChange);
      },
      [query],
    ),
    () => window.matchMedia(query).matches,
    () => false,
  );
}
/** A drag starts this close to the sheet's top (its handle and header), not lower, where it scrolls. */
const GRAB_ZONE = 64;
/** Things in the header that are pressed, not dragged. */
const PRESSABLE = 'a, button, input, textarea, select, label, [role="button"]:not(.ins-sheet-handle), [role="menu"]';

/**
 * A modal that, on a phone, is a sheet as mobbin's are: up from the bottom,
 * the page dimmed above it. Its top drags: up to fill the screen, down to
 * settle back or, when it isn't filling it, to close; the handle can also be
 * tapped (or Enter/Space) to fill or settle. While a finger is on it the
 * sheet follows by hand (inline styles, no re-render); let go, it eases to
 * where it lands. Spread `dragProps` on the modal with `ref` and `className`,
 * and put `handle` first inside it. Off a phone none of it does anything.
 */
export function useSheet(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const drag = useRef<{ y: number; h: number; dy: number; handle: boolean; moved: boolean } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      clearTimeout(settleTimer.current);
      clearTimeout(closeTimer.current);
    },
    [],
  );

  // A finger dragging the sheet doesn't scroll the page (or the sheet) too.
  // Set on whichever element is the sheet (a loading one gives way to the loaded one).
  const hold = useCallback((e: TouchEvent) => {
    if (drag.current?.moved) e.preventDefault();
  }, []);
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current?.removeEventListener('touchmove', hold);
      ref.current = node;
      node?.addEventListener('touchmove', hold, { passive: false });
    },
    [hold],
  );

  const fullHeight = () => window.innerHeight - 12;
  const release = (sheet: HTMLDivElement) => {
    sheet.style.height = '';
    sheet.style.maxHeight = '';
    sheet.style.transform = '';
  };
  /** Eases the height from where it is to `to`, then hands the size back to the stylesheet. */
  const easeHeight = (sheet: HTMLDivElement, to: number) => {
    sheet.style.maxHeight = 'none';
    sheet.style.height = `${sheet.offsetHeight}px`;
    sheet.style.transform = '';
    void sheet.offsetHeight;
    sheet.style.height = `${to}px`;
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => release(sheet), 300);
  };
  const expand = (sheet: HTMLDivElement) => {
    easeHeight(sheet, fullHeight());
    setExpanded(true);
  };
  const collapse = (sheet: HTMLDivElement) => {
    // Its own height again, measured with the full-screen size lifted.
    const from = sheet.offsetHeight;
    sheet.style.transition = 'none';
    release(sheet);
    sheet.classList.remove('is-expanded');
    const natural = sheet.offsetHeight;
    sheet.style.height = `${from}px`;
    sheet.style.maxHeight = 'none';
    void sheet.offsetHeight;
    sheet.style.transition = '';
    easeHeight(sheet, natural);
    setExpanded(false);
  };
  const dismiss = (sheet: HTMLDivElement) => {
    sheet.style.transform = 'translateY(100%)';
    closeTimer.current = setTimeout(onClose, 220);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const sheet = ref.current;
    if (!sheet || e.button !== 0 || !window.matchMedia(SHEET_QUERY).matches) return;
    const target = e.target as HTMLElement;
    const handle = !!target.closest('.ins-sheet-handle');
    if (!handle && (target.closest(PRESSABLE) || e.clientY - sheet.getBoundingClientRect().top > GRAB_ZONE)) return;
    drag.current = { y: e.clientY, h: sheet.offsetHeight, dy: 0, handle, moved: false };
    // Held from the press: however fast the finger leaves the sheet, its moves (and its release) come back here.
    // (A press with no live pointer behind it, as a script's, can't be held; it's just a press.)
    try {
      sheet.setPointerCapture(e.pointerId);
    } catch {
      drag.current = null;
    }
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const sheet = ref.current;
    if (!d || !sheet) return;
    d.dy = e.clientY - d.y;
    if (!d.moved) {
      if (Math.abs(d.dy) < 6) return;
      // Only now it's a drag (a press stays a click): it follows the finger from here.
      d.moved = true;
      sheet.classList.add('is-dragging');
    }
    sheet.style.maxHeight = 'none';
    if (d.dy < 0) {
      sheet.style.height = `${Math.min(d.h - d.dy, fullHeight())}px`;
      sheet.style.transform = '';
    } else {
      sheet.style.height = `${d.h}px`;
      sheet.style.transform = `translateY(${d.dy}px)`;
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    const sheet = ref.current;
    drag.current = null;
    if (!d || !sheet) return;
    sheet.classList.remove('is-dragging');
    if (!d.moved) {
      // A tap on the handle fills the screen, or settles it back.
      if (d.handle) return expanded ? collapse(sheet) : expand(sheet);
      return;
    }
    // A drag that ends off the sheet, over the dim, isn't a click on the dim (which closes it).
    const swallow = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (d.dy < -40) return expand(sheet);
    if (d.dy > 80) return expanded ? collapse(sheet) : dismiss(sheet);
    // Not far enough: back to where it was.
    easeHeight(sheet, d.h);
  };
  const onHandleKey = (e: ReactKeyboardEvent<HTMLSpanElement>) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || !ref.current) return;
    e.preventDefault();
    if (expanded) collapse(ref.current);
    else expand(ref.current);
  };

  return {
    ref: setRef,
    expanded,
    className: `ins-sheet ${expanded ? 'is-expanded' : ''}`,
    dragProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    handle: (
      <span
        className="ins-sheet-handle"
        role="button"
        tabIndex={0}
        aria-label={expanded ? 'Show less' : 'Show more'}
        aria-expanded={expanded}
        onKeyDown={onHandleKey}
      />
    ),
  };
}
