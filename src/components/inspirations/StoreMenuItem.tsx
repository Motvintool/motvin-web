'use client';

import type { Platform } from '@/lib/inspirations/types';
import type { StoreAction } from '@/lib/inspirations/storeAction';
import { useStoreStats } from './useStoreStats';

/**
 * "View in App Store / Google Play" (or "Visit website") in the masthead's
 * "…" menu. Apps carry no store URL of their own, so for the stores the link
 * is the live listing found by name; until that resolves, or if it finds
 * nothing, it falls back to whatever link the app has.
 */
export function StoreMenuItem({
  name,
  platform,
  action,
  onSelect,
}: {
  name: string;
  platform: Platform;
  action: StoreAction;
  onSelect: () => void;
}) {
  const { stats } = useStoreStats(name, platform);
  const href = stats?.url ?? action.href;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ins-context-menu-btn ins-context-menu-link"
      role="menuitem"
      onClick={onSelect}
    >
      <div className="ins-context-menu-btn-content">
        <div className="ins-context-menu-icon">
          <img alt="" src={action.icon} />
        </div>
        <p className="ins-context-menu-text">{action.label}</p>
      </div>
    </a>
  );
}
