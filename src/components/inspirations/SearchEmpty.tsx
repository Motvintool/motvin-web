'use client';

import { useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import type { Platform } from '@/lib/inspirations/types';
import { LogoPile } from './LogoPile';
import { RequestAppModal } from './RequestAppModal';
import { useAsync } from './useAsync';

/**
 * The search page with no results: what to do next (request the app) over
 * the library's own app icons, dropped from above
 * into a heap you can play with (LogoPile). Each icon opens its app, so the
 * dead end still leads somewhere.
 */
export function SearchEmpty({ query, platform }: { query: string; platform: Platform }) {
  const [requesting, setRequesting] = useState(false);
  const { data: apps } = useAsync(() => inspirationsApi.listApps(), 'apps:all');
  const withLogos = (apps ?? []).filter((a) => inspirationsApi.mediaUrl(a.logo));

  return (
    <div className="ins-search-empty" role="status">
      <div className="ins-search-empty-copy">
        <p className="ins-search-empty-title">Nothing matched “{query}”</p>
        <p className="ins-search-empty-desc">Try a broader phrase, or ask us to add the app you&apos;re after.</p>
        <div className="ins-search-empty-actions">
          <button type="button" className="ins-btn ins-btn--secondary" onClick={() => setRequesting(true)}>
            Request an app
          </button>
        </div>
      </div>

      <LogoPile apps={withLogos} />

      {requesting && <RequestAppModal initialName={query} initialPlatform={platform} onClose={() => setRequesting(false)} />}
    </div>
  );
}
