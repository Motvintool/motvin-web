'use client';

import { useEffect, useRef, useState } from 'react';
import { invalidateInspirationsCache, libraryVersion } from '@/lib/inspirations/api';

/** How often an open page asks whether the library changed, besides on coming back to the tab. */
const CHECK_EVERY = 30_000;

/**
 * A page keeps the screens it loaded; when the library changes elsewhere — a
 * review applied, a run finishing, another admin's edit — its screens can be
 * out of date (a screen's address now naming another picture after its
 * folder moved). This notices the library's index was rebuilt and offers a
 * refresh, rather than reloading under the admin's hands.
 */
export function LibraryUpdateNotice() {
  const loadedWith = useRef<string | null>(null);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    let live = true;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const version = await libraryVersion();
      if (!live || !version) return;
      if (loadedWith.current === null) loadedWith.current = version;
      else if (version !== loadedWith.current) setChanged(true);
    };
    void check();
    const timer = window.setInterval(() => void check(), CHECK_EVERY);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    // A change this tab made itself (the agent, the admin page) is already shown here.
    const ownChange = () => {
      loadedWith.current = null;
      void check();
    };
    window.addEventListener('motvin:admin-changed', ownChange);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('motvin:admin-changed', ownChange);
    };
  }, []);

  if (!changed) return null;
  return (
    <div className="ins-toast-stack" role="status">
      <div className="ins-toast">
        The library was updated.
        <button
          type="button"
          className="ins-toast-action"
          onClick={() => {
            invalidateInspirationsCache();
            window.location.reload();
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
