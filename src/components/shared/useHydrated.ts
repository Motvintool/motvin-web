'use client';

import { useSyncExternalStore } from 'react';

/** Nothing to subscribe to: the flag only ever flips once, via hydration. */
function subscribeNever() {
  return () => {};
}

/**
 * False on the server and during this component's own hydration render, true
 * on every render after that.
 *
 * Use it where a component branches on client-only state (the signed-in
 * user, a localStorage preference) and sits inside a Suspense boundary that
 * hydrates after the provider above it has already caught up. The provider
 * hydrates first with its server snapshot, then re-renders with the real
 * value — so by the time a lazily-hydrated boundary renders, the context it
 * reads no longer matches the HTML the server produced from the null state.
 * Gating on this flag keeps that first render identical to the server's;
 * React then re-renders with the live value straight away.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
