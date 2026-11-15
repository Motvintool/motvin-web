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
/** The live store listing for an app, found by name; the recorded link until (or unless) it's found. */
export function useStoreHref(name: string, platform: Platform, action: StoreAction): string {
  const { stats } = useStoreStats(name, platform);
  return stats?.url ?? action.href;
}

/** The same destination as a footer button (the flow preview's all-screens view). */
export function StoreLinkButton({
  name,
  platform,
  action,
  className,
}: {
  name: string;
  platform: Platform;
  action: StoreAction;
  className: string;
}) {
  const href = useStoreHref(name, platform, action);
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      <img src={action.icon} alt="" width={18} height={16} />
      {action.label}
    </a>
  );
}

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
  const href = useStoreHref(name, platform, action);
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
