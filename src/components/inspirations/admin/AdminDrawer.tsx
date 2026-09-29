'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
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

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="ins-portal ins-admin-drawer-overlay" role="presentation" onClick={close}>
      <div
        className="ins-admin-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Library admin"
        onClick={(e) => e.stopPropagation()}
      >
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
