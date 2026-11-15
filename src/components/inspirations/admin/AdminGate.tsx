'use client';

import { type ReactNode } from 'react';
import { useGoToLogin } from '../useGoToLogin';
import { useAuth } from '@/components/shared/AuthProvider';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { EmptyState } from '../EmptyState';
import { CloseIcon } from '../Icons';
import { useIsLibraryAdmin } from '../useIsLibraryAdmin';

/**
 * Access control for /inspirations/admin.
 *
 * The server decides: the page asks the admin API whether this account may
 * administer the library (useIsLibraryAdmin) before showing any tools, and
 * every admin call is checked again on its own. No admin email is kept in the
 * browser code to pre-judge it.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const goToLogin = useGoToLogin();
  const { status, error } = useIsLibraryAdmin();

  const signedIn = Boolean(user && !user.isAnonymous);

  if (!ready) {
    return <p className="ins-muted ins-admin-status">Checking your account…</p>;
  }

  if (!signedIn) {
    return (
      <EmptyState
        title="Sign in to continue"
        description="The library admin is limited to one account."
        action={{ label: 'Sign in', onClick: goToLogin }}
      />
    );
  }

  if (status === 'unknown') {
    return <p className="ins-muted ins-admin-status">Verifying with the server…</p>;
  }

  if (status === 'not-admin') {
    return (
      <EmptyState
        icon={<CloseIcon size={22} />}
        title="This account cannot administer the library"
        description={`Signed in as ${user?.email ?? 'an unknown account'}. Uploading and editing is limited to the library owner.`}
        action={{ label: 'Back to Explore', href: INSPIRATIONS_ROUTES.explore }}
      />
    );
  }

  if (status === 'error') {
    return (
      <EmptyState
        icon={<CloseIcon size={22} />}
        title="The server could not confirm this account"
        description={error ?? 'Admin access could not be checked. Try again in a moment.'}
        action={{ label: 'Back to Explore', href: INSPIRATIONS_ROUTES.explore }}
      />
    );
  }

  return (
    <>{children}</>
  );
}
