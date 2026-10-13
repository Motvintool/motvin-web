'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { HANDOFF_NOTICE_EVENT, MAX_REQUESTS_PER_USER, takeHandoffNotice } from '@/lib/firebase/appRequests';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { useToast } from './Toast';

/**
 * Says what happened to a guest's app requests when they signed in: that they
 * are now in the account, or that some didn't fit under the five-request
 * limit. The sign-in code leaves a note (saveHandoffNotice); this shows it
 * once, on the next library page, then clears it. Sign-in sends the visitor
 * back here before the move has finished, so it also listens for the note
 * arriving while the page is open. Renders nothing.
 */
export function GuestRequestsNotice() {
  const { user } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const uid = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => {
    if (!uid) return;
    const showNotice = () => {
      const notice = takeHandoffNotice();
      if (!notice) return;
      const view = { label: 'View', onClick: () => router.push(INSPIRATIONS_ROUTES.settingsRequests) };
      const plural = (n: number) => (n === 1 ? '' : 's');
      if (notice.overLimit > 0) {
        toast.show(
          `${notice.overLimit} guest request${plural(notice.overLimit)} didn’t fit: an account holds ${MAX_REQUESTS_PER_USER} at a time.`,
          view,
        );
      } else if (notice.kept > 0) {
        toast.show(`Your guest request${plural(notice.kept)} ${notice.kept === 1 ? 'is' : 'are'} now in your account.`, view);
      }
    };
    showNotice();
    window.addEventListener(HANDOFF_NOTICE_EVENT, showNotice);
    return () => window.removeEventListener(HANDOFF_NOTICE_EVENT, showNotice);
  }, [uid, toast, router]);

  return null;
}
