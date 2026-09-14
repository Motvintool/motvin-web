'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders children directly into `document.body`, escaping any stacking
 * context on the ancestor chain.
 *
 * The library page wraps the whole shell in `.mi-app-shell { position: fixed }`,
 * which creates a stacking context. Modals rendered inside that shell get
 * trapped in it and can no longer stack above ancestor siblings like
 * `.mi-product-banner`. Portalling to `<body>` lifts modals into the root
 * stacking context so their `z-index: 100` competes with the banner's
 * `z-index: 50` correctly.
 *
 * SSR-safe: returns null on the first client render (before `useEffect`
 * fires) to avoid hydration mismatches.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
