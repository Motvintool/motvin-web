'use client';

import { useEffect, useState } from 'react';
import { FALLBACK_COVER_SHOTS, loadAppCoverShots, type CoverShot } from '@/lib/inspirations/coverShots';

/** App cover pictures for the landing page. Empty until they arrive; the built-in samples if the library can't be reached. */
export function useAppCovers(): CoverShot[] {
  const [shots, setShots] = useState<CoverShot[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadAppCoverShots()
      .then((loaded) => {
        if (!cancelled) setShots(loaded.length >= 6 ? loaded : FALLBACK_COVER_SHOTS);
      })
      .catch(() => {
        if (!cancelled) setShots(FALLBACK_COVER_SHOTS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return shots;
}
