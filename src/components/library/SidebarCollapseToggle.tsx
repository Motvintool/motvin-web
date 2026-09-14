'use client';

import { useCallback, useState } from 'react';

/**
 * Fixed-position handle beside the left rail that collapses/expands it — port
 * of the collapseToggle setup in motvin-ui/COMPONENT/Multi Actions Strip.js.
 *
 * Collapsed state lives on `document.body` as `.mi-sidebar-collapsed`, which
 * the layout CSS keys off. The button flips its own arrow and updates
 * aria-expanded to match.
 *
 * Hidden below 1300px by the stylesheet (no room for the handle), but the
 * element still mounts so a resize back up doesn't have to remount.
 */
export function SidebarCollapseToggle() {
  const [collapsed, setCollapsed] = useState(false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.body.classList.toggle('mi-sidebar-collapsed', next);
      return next;
    });
  }, []);

  const label = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <button
      className="mi-sidebar-collapse-toggle"
      type="button"
      title={label}
      aria-label={label}
      aria-expanded={!collapsed}
      onClick={toggle}
    >
      <img src="/ASSET/Icons/sidebar-collapse-arrow.svg" alt="" />
    </button>
  );
}
