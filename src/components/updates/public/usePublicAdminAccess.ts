'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { hasAdminAccess } from '@/lib/firebase/updates';

/**
 * Public /updates auth state — reads useAuth and asynchronously confirms
 * whether the signed-in user can reach the publisher. Mirrors the reference
 * behaviour from script.110f497c05.js: the visitor sees the feed regardless,
 * and admin access is only used to swap the login link's label and expose the
 * admin banner.
 */

export type PublicAdminAccess = {
  ready: boolean;
  signedIn: boolean;
  canAccessAdmin: boolean;
  email: string;
  displayName: string;
};

export function usePublicAdminAccess(): PublicAdminAccess {
  const { user, ready } = useAuth();
  const email = user?.email ?? '';
  const signedIn = Boolean(user && !user.isAnonymous);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (!signedIn || !email) {
      setCanAccessAdmin(false);
      return;
    }
    let cancelled = false;
    hasAdminAccess(email)
      .then((ok) => {
        if (!cancelled) setCanAccessAdmin(ok);
      })
      .catch(() => {
        if (!cancelled) setCanAccessAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, signedIn, email]);

  return {
    ready,
    signedIn,
    canAccessAdmin,
    email,
    displayName: user?.displayName ?? '',
  };
}
