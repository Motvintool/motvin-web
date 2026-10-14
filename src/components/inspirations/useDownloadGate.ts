'use client';

import { useCallback } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';

/** Fired when a guest tries to download or copy a screen; GuestDownloadNotice shows the sign-in pill. */
export const GUEST_DOWNLOAD_EVENT = 'motvin:guest-download';

/** What the guest tried, so the notice can say "download" or "copy". */
export type GatedAction = 'download' | 'copy';

/**
 * Taking screens away (downloading them, or copying one as a PNG) is for
 * signed-in accounts. `allow()` returns whether it may go ahead; for a guest
 * (no account, or the anonymous session that only owns app requests) it
 * returns false and shows the "Sign in to download / copy" notice instead.
 */
export function useDownloadGate() {
  const { user } = useAuth();
  const isGuest = !user || user.isAnonymous;

  const allow = useCallback(
    (action: GatedAction = 'download') => {
      if (!isGuest) return true;
      window.dispatchEvent(new CustomEvent<GatedAction>(GUEST_DOWNLOAD_EVENT, { detail: action }));
      return false;
    },
    [isGuest],
  );

  return { isGuest, allow };
}
