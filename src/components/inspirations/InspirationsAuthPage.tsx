'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/shared/AuthProvider';
import { InspirationsLogin } from './InspirationsLogin';

/** Only same-site paths — a `next` of "//evil.com" or "https://…" must not redirect off-site. */
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\')) return raw;
  return '/inspirations';
}

function AuthRoute({ defaultMode }: { defaultMode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const next = safeNext(params.get('next'));
  const signedIn = Boolean(user && !user.isAnonymous);
  const modeParam = params.get('mode');
  const mode = modeParam === 'signup' || modeParam === 'login' ? modeParam : defaultMode;

  useEffect(() => {
    if (signedIn) router.replace(next);
  }, [signedIn, next, router]);

  return <InspirationsLogin defaultMode={mode} />;
}

/**
 * The standalone /login and /signup pages — the same screen the library shows
 * to signed-out visitors. Signed-in visitors are sent on to `?next=` (or the
 * library). Suspense is required because AuthRoute reads `useSearchParams`.
 */
export function InspirationsAuthPage({ defaultMode }: { defaultMode: 'login' | 'signup' }) {
  return (
    <Suspense fallback={null}>
      <AuthRoute defaultMode={defaultMode} />
    </Suspense>
  );
}
