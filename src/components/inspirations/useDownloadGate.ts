'use client';

import { useCallback } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';

/** Fired when a guest tries to download or copy an image; GuestDownloadNotice shows the sign-in pill. */
export const GUEST_DOWNLOAD_EVENT = 'motvin:guest-download';

/** What the guest tried, so the notice can say "download" or "copy". */
export type GatedAction = 'download' | 'copy';
/** What they tried it on, so the notice can say "screens" or "logos". */
export type GatedSubject = 'screens' | 'logos';
export type GatedDetail = { action: GatedAction; subject: GatedSubject };

/** Shows the guest's sign-in notice (GuestDownloadNotice) for a turned-away download or copy. */
export function notifyGuestBlocked(action: GatedAction = 'download', subject: GatedSubject = 'screens') {
  window.dispatchEvent(new CustomEvent<GatedDetail>(GUEST_DOWNLOAD_EVENT, { detail: { action, subject } }));
}

/**
 * Taking images away (downloading screens or logos, or copying one as a PNG)
 * is for signed-in accounts. `allow()` returns whether it may go ahead; for a
 * guest (no account, or the anonymous session that only owns app requests)
 * it returns false and shows the "Sign in to download / copy" notice instead.
 */
export function useDownloadGate() {
  const { user } = useAuth();
  const isGuest = !user || user.isAnonymous;

  const allow = useCallback(
    (action: GatedAction = 'download', subject: GatedSubject = 'screens') => {
      if (!isGuest) return true;
      notifyGuestBlocked(action, subject);
      return false;
    },
    [isGuest],
  );

  return { isGuest, allow };
}
