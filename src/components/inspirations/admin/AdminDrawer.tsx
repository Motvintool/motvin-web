'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../Icons';
import { AdminGate } from './AdminGate';
import { AdminView } from './AdminView';

/** Search-param name that opens the drawer — see SCREEN_PARAM in ScreenPreviewModal.tsx. */
export const ADMIN_PARAM = 'admin';

/** The mounted flag never changes after hydration, so nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

/**
 * Reads `?admin=1` off the current URL and renders the library admin as a
 * slide-over drawer above whatever page is showing, same convention as
 * ScreenPreviewOverlay/FlowPreview: ProfileMenu's "Admin" item just links to
 * `?admin=1`, so the drawer is linkable, Back closes it, and the page
 * underneath survives untouched — no separate full-page navigation needed
 * for what is really a tool you dip into, not a place you go.
 */
export function AdminDrawerOverlay() {
  const params = useSearchParams();
  if (!params.get(ADMIN_PARAM)) return null;
  return <AdminDrawer />;
}

function AdminDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const drawerRef = useRef<HTMLDivElement>(null);
  /** A pull on the phone sheet's top edge: where it began, when, and how far down it is now. */
  const pullRef = useRef<{ y: number; t: number; dy: number } | null>(null);

  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete(ADMIN_PARAM);
    const qs = sp.toString();
    // back() keeps history tidy when the drawer was opened from this page;
    // replace() covers arriving here from a shared/bookmarked link.
    if (window.history.length > 1) router.back();
    else router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  // Runs once the portal is in the page (the first render returns nothing), so focus can move into the dialog.
  useEffect(() => {
    if (!mounted) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [mounted]);

  // Phone sheet: drag the top edge down to close. Far enough (or a quick flick) closes; otherwise it springs back.
  const onPullStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(max-width: 640px)').matches || !drawerRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pullRef.current = { y: e.clientY, t: performance.now(), dy: 0 };
    drawerRef.current.style.animation = 'none';
    drawerRef.current.style.transition = 'none';
  };
  const onPullMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const pull = pullRef.current;
    if (!pull || !drawerRef.current) return;
    pull.dy = Math.max(0, e.clientY - pull.y);
    drawerRef.current.style.transform = `translateY(${pull.dy}px)`;
  };
  const onPullEnd = () => {
    const pull = pullRef.current;
    const drawer = drawerRef.current;
    pullRef.current = null;
    if (!pull || !drawer) return;
    const speed = pull.dy / Math.max(1, performance.now() - pull.t);
    if (pull.dy > 140 || (pull.dy > 40 && speed > 0.6)) {
      drawer.style.transition = 'transform 220ms cubic-bezier(0.4, 0, 1, 1)';
      drawer.style.transform = 'translateY(100%)';
      window.setTimeout(close, 200);
    } else {
      drawer.style.transition = 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)';
      drawer.style.transform = '';
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="ins-portal ins-admin-drawer-overlay" role="presentation" onClick={close}>
      <div
        ref={drawerRef}
        className="ins-admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Library admin"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Phone: the popup is a bottom sheet, with a grab handle on top. */}
        <div className="ins-admin-sheet-pull" aria-hidden onPointerDown={onPullStart} onPointerMove={onPullMove} onPointerUp={onPullEnd} onPointerCancel={onPullEnd}>
          <span className="ins-admin-sheet-handle" />
        </div>
        <button ref={closeRef} type="button" className="ins-admin-drawer-close" aria-label="Close" onClick={close}>
          <CloseIcon size={16} />
        </button>
        <div className="ins-admin-drawer-body">
          <AdminGate>
            <AdminView />
          </AdminGate>
        </div>
      </div>
    </div>,
    document.body,
  );
}
