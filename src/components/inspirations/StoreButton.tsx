'use client';

import type { Platform } from '@/lib/inspirations/types';
import type { StoreAction } from '@/lib/inspirations/storeAction';
import { useStoreStats } from './useStoreStats';

/**
 * The masthead's "View in App Store / Google Play" (or "Visit website") button.
 * Apps carry no store URL of their own, so for the stores the link is the live
 * listing found by name; until that resolves, or if it finds nothing, it falls
 * back to whatever link the app has.
 */
export function StoreButton({ name, platform, action }: { name: string; platform: Platform; action: StoreAction }) {
  const { stats } = useStoreStats(name, platform);
  const href = stats?.url ?? action.href;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="ins-btn ins-btn--masthead-store">
      <img src={action.icon} alt="" width={16} height={16} />
      <span>{action.label}</span>
    </a>
  );
}
