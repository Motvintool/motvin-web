'use client';

import { useState } from 'react';
import { appCardScreens } from '@/lib/inspirations/cover';

import { inspirationsApi } from '@/lib/inspirations/api';
import type { App, Platform, Screen } from '@/lib/inspirations/types';
import { savedAppId } from '@/lib/inspirations/savedApps';
import { AppCard } from './AppCard';
import { WebCard } from './WebCard';
import { EmptyState } from './EmptyState';
import { FloatCollectionBar } from './FloatCollectionBar';
import { FolderIcon } from './Icons';

import { useAppSelection } from './useAppSelection';
import { useAsync } from './useAsync';
import { ScreenGridSkeleton } from './Skeletons';

/**
 * A grid of app cards — each showing one of the app's own screens, same as
 * ScreenCard (see AppCard.tsx) — with click-through to that app's detail
 * page. Shared by AppsView (the dedicated /apps page) and FilteredGallery's
 * "By app" sort, so browsing by app looks and behaves the same everywhere.
 *
 * Also owns the selection session behind the float-collection bar: checking
 * a card here is the only way to reach it, so the Set lives at this level
 * and both the cards (to render checked/unchecked) and the bar (to render
 * the logo stack and save into a real collection) read from it.
 */
export function AppsGrid({
  apps,
  loading = false,
  emptyTitle = 'No apps to show',
  emptyDescription,
  emptyAction,
  emptyPlay = false,
  webLayout = false,
  platforms,
}: {
  apps: App[];
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
  /** The empty grid is a no-match (filters found nothing): show the playful empty state. */
  emptyPlay?: boolean;
  webLayout?: boolean;
  /** The platforms being browsed: an app on several shows only these platforms' screens on its card (and its card opens on them). */
  platforms?: readonly Platform[];
}) {
  const key = `${apps.map((a) => a.id).join(',')}|${platforms?.join(',') ?? ''}`;
  const { data: previews, loading: previewsLoading } = useAsync(async () => {
    // AppCard shows the app's own screens on its card, the same as a screen
    // card — the admin's carousel pick when there is one, else the automatic
    // cover — so each app needs its screens alongside its record.
    const details = await Promise.all(apps.map((app) => inspirationsApi.getApp(app.id)));
    const browsed = (screens: Screen[]) => (platforms?.length ? screens.filter((s) => platforms.includes(s.platform)) : screens);
    return new Map(apps.map((app, i) => [app.id, appCardScreens(app, browsed(details[i]?.screens ?? []))]));
  }, `apps-grid-previews:${key}`);
  const { selected, toggle, clear } = useAppSelection();

  // Every app's preview seen so far. When the list changes (a filter, a sort), the cards already known keep
  // showing while any new ones load, instead of the whole grid dropping back to placeholders — that flash
  // shook the page under the Filters panel on every pick. Kept from render, not an effect.
  const [known, setKnown] = useState<Map<string, Screen[]>>(() => new Map());
  if (previews && [...previews].some(([id, shots]) => known.get(id) !== shots)) {
    setKnown(new Map([...known, ...previews]));
  }
  const allKnown = apps.every((app) => known.has(app.id));
  const shownPreviews = previews ?? (allKnown ? known : null);

  if (loading || (previewsLoading && !shownPreviews)) {
    // On the cards' own grid (and web layout), one placeholder per app being
    // loaded — a row of five while the list itself is still on its way — so
    // neither the columns nor the count jump when the cards land.
    return <ScreenGridSkeleton count={Math.min(apps.length || 5, 10)} apps web={webLayout} />;
  }

  if (!loading && apps.length === 0) {
    return (
      <EmptyState
        play={emptyPlay}
        icon={<FolderIcon size={22} />}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  // Most-recently-checked first, so the bar's logo stack fronts whichever
  // app the user just checked rather than whichever rendered first in the
  // grid — Set iterates in insertion order, so this is just a reverse.
  const selectedApps = [...selected]
    .reverse()
    .map((id) => apps.find((a) => a.id === id))
    .filter((a): a is App => !!a);

  return (
    <>
      <div className={`ins-grid ins-app-grid ${webLayout ? 'ins-web-grid' : ''}`} role="list">
        {apps.map((app) => (
          webLayout ? <WebCard
            key={app.id}
            app={app}
            previewScreens={shownPreviews?.get(app.id)}
            selected={selected.has(app.id)}
            selectable
            onToggleSelect={() => toggle(app.id)}
          /> : <AppCard
            key={app.id}
            app={app}
            previewScreens={shownPreviews?.get(app.id)}
            selected={selected.has(app.id)}
            selectable
            onToggleSelect={() => toggle(app.id)}
          />
        ))}
      </div>
      {selectedApps.length > 0 && (
        <FloatCollectionBar
          apps={selectedApps}
          // An app on several platforms is saved as the one this grid shows.
          items={selectedApps.map((app) => ({ type: 'app' as const, id: savedAppId(app.id, app.platforms.find((p) => platforms?.includes(p)), app.platforms.length > 1 && Boolean(platforms?.length)) }))}
          onClose={clear}
          onSaved={clear}
        />
      )}
    </>
  );
}
