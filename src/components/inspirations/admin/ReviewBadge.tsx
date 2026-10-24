'use client';

import { useEffect, useState } from 'react';
import { authHeaders } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { useIsLibraryAdmin } from '../useIsLibraryAdmin';

/**
 * For admins only: a small "Not reviewed" label on an app version Claude has
 * not reviewed yet, so an upload left half-done is noticed. Visitors never see
 * it, and a reviewed version shows nothing.
 */
export function ReviewBadge({ appId, platform, version }: { appId: string; platform: string; version: string | null | undefined }) {
  const admin = useIsLibraryAdmin();
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  useEffect(() => {
    if (admin.status !== 'admin' || !version) return;
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/api/crawler/review-status?all=1', { headers: await authHeaders(), cache: 'no-store' });
        if (!res.ok || !live) return;
        const body = (await res.json()) as { reviewed?: string[] };
        setReviewed((body.reviewed ?? []).includes(`${appId}-${platform}-${version}`));
      } catch {
        // No label without the list.
      }
    })();
    return () => {
      live = false;
    };
  }, [admin.status, appId, platform, version]);
  if (admin.status !== 'admin' || reviewed !== false) return null;
  return (
    <span className="ins-review-badge" title="Not reviewed yet — ask the agent to review it.">
      Not reviewed
    </span>
  );
}
