'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuthModal } from '@/components/shared/AuthModal';
import { useAuth } from '@/components/shared/AuthProvider';
import { adminApi, isAdminEmail } from '@/lib/inspirations/admin';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { EmptyState } from '../EmptyState';
import { CheckIcon, CloseIcon } from '../Icons';

/**
 * Access control for /inspirations/admin.
 *
 * Two checks, deliberately: the email check decides what to render, and the
 * server's own check decides whether anything can actually be done. The second
 * one is the real boundary, so the page confirms with the API before showing
 * the tools rather than trusting the token's claims in the browser.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const { open: openAuth } = useAuthModal();
  // Keyed by account so a sign-out or account switch invalidates the previous
  // answer rather than leaving a stale "allowed" on screen.
  const [check, setCheck] = useState<{ uid: string; allowed: boolean; error?: string } | null>(null);

  const signedIn = Boolean(user && !user.isAnonymous);
  const looksLikeAdmin = signedIn && isAdminEmail(user?.email);
  const uid = user?.uid ?? '';

  useEffect(() => {
    if (!looksLikeAdmin) return;
    let cancelled = false;
    adminApi
      .session()
      .then(() => {
        if (!cancelled) setCheck({ uid, allowed: true });
      })
      .catch((err: Error) => {
        if (!cancelled) setCheck({ uid, allowed: false, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [looksLikeAdmin, uid]);

  const checked = check && check.uid === uid ? check : null;

  if (!ready) {
    return <p className="ins-muted ins-admin-status">Checking your account…</p>;
  }

  if (!signedIn) {
    return (
      <EmptyState
        title="Sign in to continue"
        description="The library admin is limited to one account."
        action={{ label: 'Sign in', onClick: () => openAuth('login') }}
      />
    );
  }

  if (!looksLikeAdmin) {
    return (
      <EmptyState
        icon={<CloseIcon size={22} />}
        title="This account cannot administer the library"
        description={`Signed in as ${user?.email ?? 'an unknown account'}. Uploading and editing is limited to the library owner.`}
        action={{ label: 'Back to Explore', href: INSPIRATIONS_ROUTES.explore }}
      />
    );
  }

  if (!checked) {
    return <p className="ins-muted ins-admin-status">Verifying with the server…</p>;
  }

  if (!checked.allowed) {
    return (
      <EmptyState
        icon={<CloseIcon size={22} />}
        title="The server did not accept this account"
        description={checked.error ?? 'Admin access was refused.'}
        action={{ label: 'Back to Explore', href: INSPIRATIONS_ROUTES.explore }}
      />
    );
  }

  return (
    <>
      <p className="ins-admin-signed-in">
        <CheckIcon size={13} />
        Signed in as {user?.email}. Changes here write to the store in motvin-backend.{' '}
        <Link href={INSPIRATIONS_ROUTES.explore} className="ins-link">
          View the public library
        </Link>
      </p>
      {children}
    </>
  );
}
