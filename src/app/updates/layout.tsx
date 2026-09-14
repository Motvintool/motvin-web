import type { ReactNode } from 'react';

/**
 * Route wrapper for /updates + /updates/admin. The pre-paint theme + body
 * class is set by the root layout's `THEME_INIT_SCRIPT` (path-guarded), so
 * this layout is currently a pass-through — left in place as a hook point
 * for future updates-only providers.
 */
export default function UpdatesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
