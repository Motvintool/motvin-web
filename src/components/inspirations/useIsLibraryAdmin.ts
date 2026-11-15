'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { AdminApiError, adminApi } from '@/lib/inspirations/admin';

/**
 * Whether the signed-in account may administer the library — asked of the
 * backend (its admin session check verifies the token against its own
 * allowlist), so no admin email ships in the browser code.
 *
 * - `unknown`: signed out or anonymous (nothing to ask), or still asking
 * - `admin` / `not-admin`: the server's answer (401/403 is "not-admin")
 * - `error`: the server couldn't be asked (offline, misconfigured…)
 *
 * One request per account per page load: every caller (profile menu, the
 * chat assistants, the admin gate) shares the same answer.
 */
export type LibraryAdminStatus = 'unknown' | 'admin' | 'not-admin' | 'error';

type Answer = { status: Exclude<LibraryAdminStatus, 'unknown'>; error?: string };

const answers = new Map<string, Promise<Answer>>();

function askServer(uid: string): Promise<Answer> {
  let pending = answers.get(uid);
  if (!pending) {
    pending = adminApi.session().then(
      (): Answer => ({ status: 'admin' }),
      (err: unknown): Answer => {
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) return { status: 'not-admin' };
        // Not cached: a dropped connection shouldn't stick for the whole visit.
        answers.delete(uid);
        return { status: 'error', error: (err as Error)?.message || 'Could not reach the server.' };
      },
    );
    answers.set(uid, pending);
  }
  return pending;
}

export function useIsLibraryAdmin(): { status: LibraryAdminStatus; error?: string } {
  const { user, ready } = useAuth();
  const uid = ready && user && !user.isAnonymous ? user.uid : null;
  // Keyed by account, so a sign-out or switch never shows the last answer.
  const [result, setResult] = useState<{ uid: string } & Answer>();

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void askServer(uid).then((answer) => {
      if (!cancelled) setResult({ uid, ...answer });
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!uid || !result || result.uid !== uid) return { status: 'unknown' };
  return { status: result.status, error: result.error };
}
