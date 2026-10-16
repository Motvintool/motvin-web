'use client';

import { useState } from 'react';
import type { Platform } from '@/lib/inspirations/types';
import { PlayEmpty } from './PlayEmpty';
import { RequestAppModal } from './RequestAppModal';

/**
 * The search page with no results at all: the playful empty state
 * (PlayEmpty), whose next step is requesting the app that was searched for.
 */
export function SearchEmpty({ query, platform }: { query: string; platform: Platform }) {
  const [requesting, setRequesting] = useState(false);

  return (
    <PlayEmpty
      title={<>Nothing matched “{query}”</>}
      description="Try a broader phrase, or ask us to add the app you're after."
      action={{ label: 'Request an app', onClick: () => setRequesting(true) }}
    >
      {requesting && <RequestAppModal initialName={query} initialPlatform={platform} onClose={() => setRequesting(false)} />}
    </PlayEmpty>
  );
}
