'use client';

import { useEffect, useState } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { appCardScreens } from '@/lib/inspirations/cover';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { INDUSTRY_LABEL } from '@/lib/inspirations/taxonomy';
import { isDesktopPlatform, type LibraryCounts } from '@/lib/inspirations/types';

export type LandingApp = {
  id: string;
  name: string;
  href: string;
  logo: string | null;
  industry: string;
  /** The same picture the Apps page puts on this app's card. */
  cover: string | null;
  /** Web apps get a wide cover; phone apps a tall one. */
  wide: boolean;
  /** How many screens the library holds for this app. */
  screenCount: number;
};

/**
 * Everything the landing page's Inspirations sections show, read live from
 * the library: each app with its card cover, and the library's real counts.
 * Empty until it loads; stays empty if the library can't be reached.
 */
export function useLandingLibrary(): { apps: LandingApp[]; counts: LibraryCounts | null } {
  const [apps, setApps] = useState<LandingApp[]>([]);
  const [counts, setCounts] = useState<LibraryCounts | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [list, meta] = await Promise.all([inspirationsApi.listApps(), inspirationsApi.getMeta()]);
      const details = await Promise.all(list.map((app) => inspirationsApi.getApp(app.id)));
      if (cancelled) return;
      setCounts(meta.counts);
      setApps(
        list.map((app, i) => {
          const wide = app.platforms.length > 0 && app.platforms.every((p) => isDesktopPlatform(p));
          const cover = appCardScreens(app, details[i]?.screens ?? [])[0];
          return {
            id: app.id,
            name: app.name,
            href: INSPIRATIONS_ROUTES.app(app),
            logo: inspirationsApi.mediaUrl(app.logo),
            industry: INDUSTRY_LABEL[app.industry] ?? app.industry,
            cover: cover ? inspirationsApi.mediaUrl(cover.url) : null,
            wide,
            screenCount: app.screenCount,
          };
        }),
      );
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  return { apps, counts };
}
