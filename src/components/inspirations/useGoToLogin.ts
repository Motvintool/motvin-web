'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Opens the login page, which sends the visitor back to the page they were on
 * once they are signed in. `reopen` adds query params to that return address,
 * so the page can pick up where they left off (`{ logo: '1' }` reopens an
 * app's logo view).
 */
export function useGoToLogin(): (reopen?: Record<string, string>) => void {
  const router = useRouter();
  return useCallback(
    (reopen?: Record<string, string>) => {
      const search = new URLSearchParams(window.location.search);
      // Buttons pass this straight to onClick, which hands it the click event:
      // only a plain object of params counts.
      const extra = reopen && Object.getPrototypeOf(reopen) === Object.prototype ? reopen : {};
      for (const [key, value] of Object.entries(extra)) search.set(key, value);
      const query = search.toString();
      const here = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
      router.push(`/login?next=${encodeURIComponent(here)}`);
    },
    [router],
  );
}
