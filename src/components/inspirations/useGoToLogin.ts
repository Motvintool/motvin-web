'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/** Opens the login page, which sends the visitor back to the page they were on once they are signed in. */
export function useGoToLogin(): () => void {
  const router = useRouter();
  return useCallback(() => {
    const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    router.push(`/login?next=${encodeURIComponent(here)}`);
  }, [router]);
}
