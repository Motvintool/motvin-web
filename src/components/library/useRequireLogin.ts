'use client';

import { useCallback } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { useAuthModal } from '@/components/shared/AuthModal';

/**
 * Gate for copy/download actions — port of `requireLoginToDownload` from
 * motvin-ui/JS/motvin-icons.js:2598.
 *
 *   - Anonymous or signed-out visitors → opens the auth modal in login mode
 *     and the caller aborts.
 *   - Signed-in real users → returns true; the caller proceeds.
 *
 * The reference showed the AuthModal (`window.AuthModal.open("login")`);
 * we mirror that by using the shared `useAuthModal` provider.
 */
export function useRequireLogin(): () => boolean {
  const { user } = useAuth();
  const { open } = useAuthModal();

  return useCallback(() => {
    if (!user || user.isAnonymous) {
      open('login');
      return false;
    }
    return true;
  }, [user, open]);
}
