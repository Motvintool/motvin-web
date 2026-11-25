'use client';

import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { inspirationsApi } from '@/lib/inspirations/api';
import { browsedPlatforms, isWebsPlatforms } from '@/lib/inspirations/filters';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { EmptyState } from '../EmptyState';
import { NavPill, ToolbarRow } from '../FilterToolbar';
import { PageHeading } from '../PageHeading';
import { ScreenGridSkeleton } from '../Skeletons';
import { StoreShotsCard } from '../StoreShotsCard';
import { useAsync } from '../useAsync';
import { useMeta } from '../useMeta';

/**
 * /inspirations/screenshots — every app's App Store screenshots, one Screenshots card per app (the app page's
 * own), newest set first. Only the section on show: iOS sets in Apps, web app sets in Webs.
 */
export function ScreenshotsView() {
  const meta = useMeta();
  const params = useSearchParams();
  const platforms = browsedPlatforms(params);
  const webs = isWebsPlatforms(platforms);
  const scopeKey = platforms.join(',');
  const { data: apps, loading } = useAsync(() => inspirationsApi.listApps(), 'apps:all');

  const sets = useMemo(() => {
    const scope = scopeKey.split(',');
    return (apps ?? [])
      .flatMap((app) =>
        app.platforms.filter((p) => scope.includes(p)).flatMap((platform) => {
          const set = app.storeShots?.[platform];
          return set?.images.length ? [{ app, platform, set }] : [];
        }),
      )
      .sort((a, b) => b.set.date.localeCompare(a.set.date) || a.app.name.localeCompare(b.app.name));
  }, [apps, scopeKey]);

  return (
    <>
      <PageHeading title="App Store Screenshots" />

      <ToolbarRow total={null} unit="app">
        <NavPill counts={meta.counts} activeCount={loading ? null : sets.length} />
      </ToolbarRow>

      <section className="ins-shot-panel">
        {loading && !apps ? (
          <ScreenGridSkeleton count={10} meta web={webs} />
        ) : sets.length === 0 ? (
          <EmptyState
            play
            title={webs ? 'No web app screenshots yet' : 'No App Store screenshots yet'}
            description="Apps' store screenshots show here once they are added."
            action={{ label: 'Explore apps', href: webs ? `${INSPIRATIONS_ROUTES.apps}?platform=web` : INSPIRATIONS_ROUTES.apps }}
          />
        ) : (
          // Keyed, as a collection's: several sets on one page, so the link names the app as well as the image.
          <div className={`ins-grid ${webs ? 'ins-web-grid' : ''}`} role="list">
            {sets.map(({ app, platform, set }) => (
              <StoreShotsCard key={`${app.id}@${platform}`} set={set} app={app} platform={platform} keyed showApp />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
